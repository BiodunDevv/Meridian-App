import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  BalanceResult,
  CatalogueItem,
  Mode,
  ProductRef,
  ProviderAdapter,
  PurchaseOutcome,
  PurchaseRequest,
  ValidationResult,
  WebhookEvent,
} from "./types";

/**
 * A fake provider for development and tests. It spends no money and needs no keys.
 * The outcome is chosen by the customer's main input (phone, meter, smartcard or email),
 * using the same magic numbers as the VTpass sandbox so behaviour matches what you will see there:
 *
 *   201000000000  pending for 2 status checks, then success
 *   200000000000  pending forever (stuck: needs an admin)
 *   300000000000  timeout: the purchase WORKED but the reply is lost (status() finds success)
 *   400000000000  no response: the purchase never happened (status() says not_found)
 *   500000000000  unexpected reply: unknown outcome
 *   000000000000  failed
 *   anything else success
 *
 * State lives in memory, per process, keyed by request id. That is enough for development and
 * simulation scripts; it is not a database.
 */
type Scenario =
  | "success"
  | "pending_then_success"
  | "stuck"
  | "timeout"
  | "no_response"
  | "unexpected"
  | "fail";

interface Record_ {
  scenario: Scenario;
  polls: number;
  purchaseCalls: number;
  lostRequest: boolean;
}

const store = new Map<string, Record_>();

/** Test hook: forget everything. */
export function resetMock() {
  store.clear();
}
/** Test hook: how many times a purchase reached the provider for this request id. */
export function mockPurchaseCalls(requestId: string) {
  return store.get(requestId)?.purchaseCalls ?? 0;
}
/** Test hook: how many purchases the provider has accepted in total. */
export function mockTotalPurchases() {
  return [...store.values()].reduce((n, r) => n + r.purchaseCalls, 0);
}

const MAIN_KEYS = ["phone", "meter", "smartcard", "email"] as const;
export function mockScenario(inputs: Record<string, string>): Scenario {
  const v = MAIN_KEYS.map((k) => inputs[k]).find(Boolean) ?? "";
  switch (v) {
    case "201000000000":
      return "pending_then_success";
    case "200000000000":
      return "stuck";
    case "300000000000":
      return "timeout";
    case "400000000000":
      return "no_response";
    case "500000000000":
      return "unexpected";
    case "000000000000":
      return "fail";
    default:
      return "success";
  }
}

const ok = (ref: string, req?: PurchaseRequest): PurchaseOutcome => ({
  status: "success",
  providerRef: ref,
  message: "Delivered by the mock provider.",
  providerCode: "000",
  delivery: req?.inputs.meter
    ? { kind: "token", token: "0000-0000-0000-0000-0000", units: "1.0" }
    : { kind: "none" },
  raw: { mock: true },
});

export function createMockProvider(mode: Mode = "sandbox"): ProviderAdapter {
  const adapter: ProviderAdapter = {
    key: "mock",
    mode,
    isConfigured: () => true,
    async balance(): Promise<BalanceResult> {
      return { balanceMinor: 100_000_000, currency: "NGN" };
    },
    async ping() {
      return { ok: true, message: "The mock provider is always available." };
    },
    async catalogue(): Promise<CatalogueItem[]> {
      return [
        {
          providerCode: "mock-sample-airtime",
          name: "Sample airtime (mock)",
          categorySlug: "airtime",
          kind: "open",
          currency: "NGN",
          denominations: [],
          minMinor: 10_000,
          maxMinor: 5_000_000,
          costBps: 9800,
        },
        {
          providerCode: "mock-sample-data",
          name: "Sample data bundle (mock)",
          categorySlug: "data",
          kind: "fixed",
          currency: "NGN",
          denominations: [
            { label: "1GB", valueMinor: 50_000, costMinor: 48_000 },
          ],
          minMinor: 0,
          maxMinor: 0,
          costBps: 10000,
        },
      ];
    },
    async validateInput(
      _p: ProductRef,
      inputs: Record<string, string>,
    ): Promise<ValidationResult> {
      const main = MAIN_KEYS.map((k) => inputs[k]).find(Boolean);
      return main
        ? {
            ok: true,
            confirmedName: inputs.meter ? "Mock Customer" : undefined,
          }
        : { ok: false, error: "Enter the number or email for this product." };
    },
    async purchase(req: PurchaseRequest): Promise<PurchaseOutcome> {
      let rec = store.get(req.requestId);
      if (rec) {
        // The same request id again: the provider does not buy twice. It repeats its answer.
        return outcomeOf(rec, req, false);
      }
      rec = {
        scenario: mockScenario(req.inputs),
        polls: 0,
        purchaseCalls: 1,
        lostRequest: false,
      };
      if (rec.scenario === "no_response") rec.lostRequest = true;
      if (rec.lostRequest) {
        // The purchase never reached the provider: leave no record.
        return {
          status: "unknown",
          message: "No response from the provider.",
          raw: { mock: true },
        };
      }
      store.set(req.requestId, rec);
      return outcomeOf(rec, req, true);
    },
    async status(requestId: string): Promise<PurchaseOutcome> {
      const rec = store.get(requestId);
      if (!rec)
        return {
          status: "not_found",
          message: "The provider has no record of this request.",
          providerCode: "015",
        };
      rec.polls += 1;
      return statusOf(rec, requestId);
    },
    parseWebhook(headers, rawBody): WebhookEvent | null {
      const secret = process.env.AUTH_SECRET;
      const sig = headers.get("x-mock-signature");
      if (!secret || !sig) return null;
      const expected = createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
      try {
        const body = JSON.parse(rawBody) as {
          requestId?: string;
          status?: string;
        };
        if (!body.requestId) return null;
        const status =
          body.status === "success"
            ? "success"
            : body.status === "failed"
              ? "failed"
              : "pending";
        return {
          requestId: body.requestId,
          outcome: {
            status,
            message: `Mock callback: ${status}.`,
            raw: { mock: true },
          },
          confirmWithStatus: false,
        };
      } catch {
        return null;
      }
    },
  };
  return adapter;
}

function outcomeOf(
  rec: Record_,
  req: PurchaseRequest,
  first: boolean,
): PurchaseOutcome {
  switch (rec.scenario) {
    case "success":
      return ok(`MOCK-${req.requestId}`, req);
    case "pending_then_success":
    case "stuck":
      return {
        status: "pending",
        providerRef: `MOCK-${req.requestId}`,
        message: "The mock provider is still processing.",
        providerCode: "099",
        raw: { mock: true },
      };
    case "timeout":
      // The provider acted, but the reply never arrives.
      return first
        ? {
            status: "unknown",
            message: "The provider did not reply in time.",
            raw: { mock: true },
          }
        : ok(`MOCK-${req.requestId}`, req);
    case "unexpected":
      return {
        status: "unknown",
        message: "The provider sent a reply we could not read.",
        raw: { mock: true },
      };
    case "fail":
      return {
        status: "failed",
        message: "The mock provider rejected the order.",
        providerCode: "016",
        raw: { mock: true },
      };
    default:
      return {
        status: "unknown",
        message: "Unclear outcome.",
        raw: { mock: true },
      };
  }
}

function statusOf(rec: Record_, requestId: string): PurchaseOutcome {
  const ref = `MOCK-${requestId}`;
  switch (rec.scenario) {
    case "pending_then_success":
      return rec.polls >= 2
        ? ok(ref)
        : {
            status: "pending",
            providerRef: ref,
            message: "Still processing.",
            providerCode: "099",
          };
    case "stuck":
      return {
        status: "pending",
        providerRef: ref,
        message: "Still processing.",
        providerCode: "099",
      };
    case "fail":
      return {
        status: "failed",
        providerRef: ref,
        message: "The mock provider rejected the order.",
        providerCode: "016",
      };
    case "unexpected":
      return {
        status: "unknown",
        message: "The provider sent a reply we could not read.",
      };
    default:
      return ok(ref);
  }
}
