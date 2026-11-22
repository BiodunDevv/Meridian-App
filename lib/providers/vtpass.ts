import { getEnv } from "../env";
import { type FetchLike, httpJson } from "./http";
import { redact } from "./redact";
import {
  type BalanceResult,
  type CatalogueItem,
  type Delivery,
  type Mode,
  type ProductRef,
  type ProviderAdapter,
  type PurchaseOutcome,
  type PurchaseRequest,
  type ValidationResult,
  type WebhookEvent,
} from "./types";

/**
 * VTpass: airtime, data, electricity and cable TV.
 * Docs read on 2026-11-16: https://vtpass.com/documentation/ (authentication, buying services,
 * requery, response codes, wallet balance, variation codes, transaction update webhook).
 *
 *  - Sandbox https://sandbox.vtpass.com/api, live https://vtpass.com/api (same paths).
 *  - GET needs `api-key` + `public-key`; POST needs `api-key` + `secret-key`.
 *  - `request_id` is at least 12 characters and its first 12 are the Africa/Lagos date and time
 *    (YYYYMMDDHHII) of the purchase. Code 085 means it was wrong, 014 means it was used already.
 *  - Pending codes and any timeout must be requeried, never bought again.
 */
export interface VtpassCreds {
  apiKey: string;
  publicKey: string;
  secretKey: string;
}

const BASE: Record<Mode, string> = {
  sandbox: "https://sandbox.vtpass.com/api",
  live: "https://vtpass.com/api",
};

export function vtpassCredsFromEnv(mode: Mode): VtpassCreds {
  const e = getEnv();
  // Mode-specific keys win. If only the single set (VTPASS_API_KEY and so on) is present, it is used for either mode,
  // so you can swap the values when you go live. Keys that do not match the mode simply fail to sign in; no money moves.
  const m =
    mode === "live"
      ? {
          a: e.VTPASS_LIVE_API_KEY,
          p: e.VTPASS_LIVE_PUBLIC_KEY,
          s: e.VTPASS_LIVE_SECRET_KEY,
        }
      : {
          a: e.VTPASS_SANDBOX_API_KEY,
          p: e.VTPASS_SANDBOX_PUBLIC_KEY,
          s: e.VTPASS_SANDBOX_SECRET_KEY,
        };
  return {
    apiKey: m.a || e.VTPASS_API_KEY,
    publicKey: m.p || e.VTPASS_PUBLIC_KEY,
    secretKey: m.s || e.VTPASS_SECRET_KEY,
  };
}

/**
 * The request id: Lagos date and time (YYYYMMDDHHII), then our order number without dashes.
 * Make it ONCE, at the first purchase attempt, and store it on the order. VTpass rejects an id whose
 * date is not today (code 085), so it cannot be regenerated on a later day; requery with the stored id.
 */
export function vtpassRequestId(orderNumber: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const stamp = `${g("year")}${g("month")}${g("day")}${g("hour")}${g("minute")}`;
  return `${stamp}${orderNumber.replace(/[^A-Za-z0-9]/g, "")}`;
}

/* ---------- The services we sell, by VTpass serviceID ---------- */
const AIRTIME: [string, string][] = [
  ["mtn", "MTN Airtime"],
  ["airtel", "Airtel Airtime"],
  ["glo", "Glo Airtime"],
  ["etisalat", "9mobile Airtime"],
];
const DATA: [string, string][] = [
  ["mtn-data", "MTN Data"],
  ["airtel-data", "Airtel Data"],
  ["glo-data", "Glo Data"],
  ["glo-sme-data", "Glo SME Data"],
  ["etisalat-data", "9mobile Data"],
];
const TV: [string, string][] = [
  ["dstv", "DStv"],
  ["gotv", "GOtv"],
  ["startimes", "StarTimes"],
  ["showmax", "Showmax"],
];
const ELECTRICITY: [string, string][] = [
  ["ikeja-electric", "Ikeja Electric (IKEDC)"],
  ["eko-electric", "Eko Electric (EKEDC)"],
  ["abuja-electric", "Abuja Electric (AEDC)"],
  ["kano-electric", "Kano Electric (KEDCO)"],
  ["portharcourt-electric", "Port Harcourt Electric (PHED)"],
  ["jos-electric", "Jos Electric (JED)"],
  ["ibadan-electric", "Ibadan Electric (IBEDC)"],
  ["kaduna-electric", "Kaduna Electric (KAEDCO)"],
  ["enugu-electric", "Enugu Electric (EEDC)"],
  ["benin-electric", "Benin Electric (BEDC)"],
  ["yola-electric", "Yola Electric (YEDC)"],
  ["aba-electric", "Aba Power"],
];

const serviceOf = (providerCode: string) => providerCode.split(":")[0];
const variationOf = (providerCode: string) =>
  providerCode.includes(":") ? providerCode.split(":").slice(1).join(":") : "";

export function vtpassCategory(providerCode: string): string | undefined {
  const s = serviceOf(providerCode);
  if (AIRTIME.some(([id]) => id === s)) return "airtime";
  if (DATA.some(([id]) => id === s)) return "data";
  if (TV.some(([id]) => id === s)) return "tv";
  if (ELECTRICITY.some(([id]) => id === s)) return "electricity";
  return undefined;
}

/* ---------- Reading replies ---------- */
const FAILED_CODES = new Set([
  "010",
  "011",
  "012",
  "013",
  "015",
  "016",
  "017",
  "018",
  "019",
  "021",
  "022",
  "023",
  "024",
  "025",
  "026",
  "027",
  "028",
  "030",
  "031",
  "032",
  "034",
  "035",
  "083",
  "085",
  "087",
  "091",
]);
const PENDING_CODES = new Set(["099", "089"]);

type Json = Record<string, any>;

function deliveryOf(j: Json): Delivery {
  const raw =
    (j.token ?? "") ||
    String(j.purchased_code ?? "").replace(/^\s*token\s*:\s*/i, "");
  const token = String(raw).trim();
  if (token)
    return {
      kind: "token",
      token,
      units: j.units ? String(j.units) : undefined,
    };
  return { kind: "none" };
}

/** Turns a VTpass reply into an outcome. Anything not clearly understood is `unknown`, never a failure. */
export function classifyVtpass(
  http: { status: number; json: unknown; noResponse: boolean },
  requery = false,
): PurchaseOutcome {
  if (http.noResponse || !http.json || typeof http.json !== "object")
    return { status: "unknown", message: "No clear reply from VTpass." };
  const j = http.json as Json;
  const code = String(j.code ?? j.response_description ?? "");
  const tx = j.content?.transactions as Json | undefined;
  const raw = redact(j);
  const ref = tx?.transactionId ? String(tx.transactionId) : undefined;
  const text = String(j.response_description ?? "");

  if (code === "000") {
    const st = String(tx?.status ?? "").toLowerCase();
    if (st === "delivered")
      return {
        status: "success",
        providerRef: ref,
        message: "Delivered.",
        providerCode: code,
        delivery: deliveryOf(j),
        raw,
      };
    if (st === "pending" || st === "initiated")
      return {
        status: "pending",
        providerRef: ref,
        message: "VTpass is still processing.",
        providerCode: code,
        raw,
      };
    if (st === "failed" || st === "reversed")
      return {
        status: "failed",
        providerRef: ref,
        message: "VTpass could not complete the order.",
        providerCode: code,
        raw,
      };
    return {
      status: "unknown",
      message: "VTpass sent a status we do not recognise.",
      providerCode: code,
      raw,
    };
  }
  if (PENDING_CODES.has(code))
    return {
      status: "pending",
      providerRef: ref,
      message: "VTpass is processing the order.",
      providerCode: code,
      raw,
    };
  if (code === "015" && requery)
    return {
      status: "not_found",
      message: "VTpass has no record of this request id.",
      providerCode: code,
      raw,
    };
  if (code === "014")
    // The id was used already: the purchase happened. Find out how it ended.
    return {
      status: "unknown",
      message: "VTpass already has this request id. Check its status.",
      providerCode: code,
      raw,
    };
  if (FAILED_CODES.has(code))
    return {
      status: "failed",
      message: text ? `VTpass refused: ${text}` : "VTpass refused the order.",
      providerCode: code,
      raw,
    };
  // 040, 044 and anything else: not safe to call a failure.
  return {
    status: "unknown",
    message: "VTpass sent a reply that needs a status check.",
    providerCode: code,
    raw,
  };
}

/* ---------- The adapter ---------- */
export function createVtpass(
  mode: Mode,
  opts: { creds?: VtpassCreds; fetch?: FetchLike; webhookSecret?: string } = {},
): ProviderAdapter {
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  const creds = () => opts.creds ?? vtpassCredsFromEnv(mode);
  const configured = () => {
    const c = creds();
    return Boolean(c.apiKey && c.publicKey && c.secretKey);
  };
  const get = (path: string) =>
    httpJson(doFetch, `${BASE[mode]}${path}`, {
      method: "GET",
      headers: { "api-key": creds().apiKey, "public-key": creds().publicKey },
    });
  const post = (path: string, body: unknown, timeoutMs?: number) =>
    httpJson(doFetch, `${BASE[mode]}${path}`, {
      method: "POST",
      headers: { "api-key": creds().apiKey, "secret-key": creds().secretKey },
      body,
      timeoutMs,
    });

  const adapter: ProviderAdapter = {
    key: "vtpass",
    mode,
    isConfigured: configured,

    async balance(): Promise<BalanceResult> {
      const r = await get("/balance");
      // VTpass sends the balance as a number or as text such as "2000000.00".
      const bal = Number((r.json as Json | null)?.contents?.balance);
      if (!Number.isFinite(bal))
        throw new Error(
          "VTpass did not return a balance. Check the keys and the mode.",
        );
      return { balanceMinor: Math.round(bal * 100), currency: "NGN" };
    },

    async ping() {
      if (!configured())
        return {
          ok: false,
          message: `VTpass keys for ${mode} mode are missing.`,
        };
      try {
        await adapter.balance();
        return { ok: true, message: `Connected to VTpass (${mode}).` };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : "Could not reach VTpass.",
        };
      }
    },

    async catalogue(): Promise<CatalogueItem[]> {
      const items: CatalogueItem[] = [];
      for (const [id, name] of AIRTIME)
        items.push({
          providerCode: id,
          name,
          categorySlug: "airtime",
          kind: "open",
          currency: "NGN",
          denominations: [],
          minMinor: 5_000,
          maxMinor: 5_000_000,
          costBps: 10_000,
          notes:
            "Cost assumes no VTpass commission. Lower the cost % once you have read your commission rate.",
        });
      for (const [id, name] of ELECTRICITY)
        items.push({
          providerCode: id,
          name,
          categorySlug: "electricity",
          kind: "open",
          currency: "NGN",
          denominations: [],
          minMinor: 50_000,
          maxMinor: 50_000_000,
          costBps: 10_000,
          notes: "Prepaid and postpaid. Cost assumes no commission.",
        });
      // Variation lists are fetched live. A failed fetch skips that service; the rest still sync.
      const withVariations: [string, string, string][] = [
        ...DATA.map(([id, n]) => [id, n, "data"] as [string, string, string]),
        ...TV.map(([id, n]) => [id, n, "tv"] as [string, string, string]),
      ];
      const results = await Promise.allSettled(
        withVariations.map(async ([id, name, cat]) => {
          const r = await get(
            `/service-variations?serviceID=${encodeURIComponent(id)}`,
          );
          const content = (r.json as Json | null)?.content as Json | undefined;
          const vars = (content?.variations ?? content?.varations) as
            Json[] | undefined;
          if (!Array.isArray(vars)) throw new Error(`No variations for ${id}`);
          return vars.flatMap((v) => {
            const amount = Number(v.variation_amount);
            // A variation with no fixed price (amount 0 or fixedPrice "No") cannot be sold as a fixed item.
            if (!v.variation_code || !Number.isFinite(amount) || amount <= 0)
              return [];
            const minor = Math.round(amount * 100);
            return [
              {
                providerCode: `${id}:${v.variation_code}`,
                name: `${name}: ${String(v.name ?? v.variation_code)}`,
                categorySlug: cat,
                kind: "fixed" as const,
                currency: "NGN" as const,
                denominations: [
                  {
                    label: String(v.name ?? v.variation_code),
                    valueMinor: minor,
                    costMinor: minor,
                  },
                ],
                minMinor: 0,
                maxMinor: 0,
                costBps: 10_000,
                notes: "Cost assumes no commission.",
              },
            ];
          });
        }),
      );
      for (const r of results)
        if (r.status === "fulfilled") items.push(...r.value);
      return items;
    },

    async validateInput(
      product: ProductRef,
      inputs: Record<string, string>,
    ): Promise<ValidationResult> {
      const cat = product.categorySlug ?? vtpassCategory(product.providerCode);
      if ((cat === "tv" || cat === "electricity") && !inputs.phone)
        return { ok: false, error: "A phone number is needed for this order." };
      if (cat !== "tv" && cat !== "electricity") return { ok: true };
      // Ask VTpass whether the meter or smartcard exists, so a typo is caught before the customer pays.
      const billersCode = inputs.meter ?? inputs.smartcard;
      if (!billersCode)
        return { ok: false, error: "Enter the meter or smartcard number." };
      const body: Record<string, string> = {
        billersCode,
        serviceID: serviceOf(product.providerCode),
      };
      if (cat === "electricity")
        body.type = inputs.meterType === "postpaid" ? "postpaid" : "prepaid";
      const r = await post("/merchant-verify", body, 15_000);
      const j = r.json as Json | null;
      if (r.noResponse || !j)
        return {
          ok: false,
          error: "We could not check this number right now. Try again shortly.",
        };
      const c = j.content as Json | undefined;
      if (String(j.code) !== "000" || c?.error || c?.WrongBillersCode)
        return {
          ok: false,
          error: "VTpass could not find that number. Check it and try again.",
        };
      const name = c?.Customer_Name ?? c?.customerName;
      return { ok: true, confirmedName: name ? String(name) : undefined };
    },

    async purchase(req: PurchaseRequest): Promise<PurchaseOutcome> {
      const service = serviceOf(req.providerCode);
      const cat = vtpassCategory(req.providerCode);
      if (!cat)
        return {
          status: "failed",
          message: "This product is not a VTpass product we know how to buy.",
        };
      if (req.currency !== "NGN")
        return { status: "failed", message: "VTpass sells in naira only." };
      const amount = req.valueMinor / 100;
      const phone = req.inputs.phone;
      const body: Record<string, unknown> = {
        request_id: req.requestId,
        serviceID: service,
      };
      if (cat === "airtime") Object.assign(body, { amount, phone });
      else if (cat === "data")
        Object.assign(body, {
          billersCode: phone,
          variation_code: variationOf(req.providerCode),
          phone,
        });
      else if (cat === "tv")
        Object.assign(body, {
          billersCode: req.inputs.smartcard,
          variation_code: variationOf(req.providerCode),
          amount,
          phone,
          subscription_type: "change",
        });
      else
        Object.assign(body, {
          billersCode: req.inputs.meter,
          variation_code:
            req.inputs.meterType === "postpaid" ? "postpaid" : "prepaid",
          amount,
          phone,
        });
      const missing = Object.entries(body).filter(
        ([, v]) => v === undefined || v === "",
      );
      if (missing.length)
        return {
          status: "failed",
          message: `Missing ${missing.map(([k]) => k).join(", ")}. Nothing was sent.`,
        };
      // Exactly one POST. No retry here, whatever happens.
      return classifyVtpass(await post("/pay", body));
    },

    async status(requestId: string): Promise<PurchaseOutcome> {
      return classifyVtpass(
        await post("/requery", { request_id: requestId }),
        true,
      );
    },

    parseWebhook(_headers, rawBody, query): WebhookEvent | null {
      const secret = opts.webhookSecret ?? getEnv().VTPASS_WEBHOOK_SECRET;
      // VTpass signs nothing, so the URL carries a secret. No secret configured: refuse everything.
      if (!secret || query?.get("secret") !== secret) return null;
      try {
        const body = JSON.parse(rawBody) as Json;
        if (body.type !== "transaction-update" || !body.data?.requestId)
          return null;
        const outcome = classifyVtpass({
          status: 200,
          json: body.data,
          noResponse: false,
        });
        return {
          requestId: String(body.data.requestId),
          outcome,
          confirmWithStatus: true,
        };
      } catch {
        return null;
      }
    },
  };
  return adapter;
}
