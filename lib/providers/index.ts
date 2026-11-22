import { connectDb } from "../db";
import { Provider } from "../models";
import { createMockProvider } from "./mock";
import {
  type Mode,
  type ProviderAdapter,
  type PurchaseOutcome,
  type PurchaseRequest,
} from "./types";
import { createVtpass, vtpassRequestId } from "./vtpass";

export const PROVIDER_KEYS = ["mock", "vtpass"] as const;
export type ProviderKey = (typeof PROVIDER_KEYS)[number];

/** Builds the adapter for a provider key and mode. Returns null for an unknown key. */
export function createAdapter(key: string, mode: Mode): ProviderAdapter | null {
  switch (key) {
    case "mock":
      return createMockProvider(mode);
    case "vtpass":
      return createVtpass(mode);
    default:
      return null;
  }
}

/**
 * The adapter for a provider as configured in the admin. The mode comes from the database, the keys from the
 * environment, so switching sandbox to live changes nothing in code. Disabled providers are refused, which is
 * the kill switch: no order can reach a provider an admin has turned off.
 */
export async function getAdapter(key: string): Promise<ProviderAdapter> {
  await connectDb();
  const doc = await Provider.findOne({ key }).lean();
  if (!doc) throw new Error(`Provider "${key}" is not set up.`);
  if (!doc.active) throw new Error(`${doc.name} is switched off.`);
  const adapter = createAdapter(key, doc.mode as Mode);
  if (!adapter) throw new Error(`No adapter for "${key}".`);
  return adapter;
}

/** Active providers, lowest priority number first. Use it to pick a fallback for a product sold by two providers. */
export async function activeProvidersInOrder(keys?: string[]) {
  await connectDb();
  const docs = await Provider.find({
    active: true,
    ...(keys ? { key: { $in: keys } } : {}),
  })
    .sort({ priority: 1 })
    .lean();
  return docs.map((d) => String(d.key));
}

/**
 * Checks credentials, reads the wallet balance and records both on the provider. Spends no money.
 * Used by the admin "Test connection" and "Refresh balance" buttons and by the float check cron.
 */
export async function checkProvider(key: string) {
  await connectDb();
  const doc = await Provider.findOne({ key });
  if (!doc) throw new Error("Provider not found.");
  const adapter = createAdapter(key, doc.mode as Mode);
  if (!adapter) throw new Error(`No adapter for "${key}".`);
  const ping = await adapter.ping();
  doc.lastCheckedAt = new Date();
  if (!ping.ok) {
    doc.status = "error";
    await doc.save();
    return { ok: false as const, message: ping.message };
  }
  try {
    const b = await adapter.balance();
    doc.lastBalanceMinor = b.balanceMinor;
    doc.lastBalanceCurrency = b.currency;
    doc.status = "ok";
    await doc.save();
    return { ok: true as const, message: ping.message, balance: b };
  } catch (e) {
    doc.status = "error";
    await doc.save();
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Could not read the balance.",
    };
  }
}

/**
 * Sends ONE purchase. If the provider's answer is unclear (timeout, no reply) it asks for the status once,
 * and never sends the purchase a second time. `retryable` is true only when the provider confirmed it has no
 * record of the request, which is the one case where buying again is safe.
 */
export async function attemptPurchase(
  adapter: ProviderAdapter,
  req: PurchaseRequest,
): Promise<{ outcome: PurchaseOutcome; retryable: boolean }> {
  const first = await adapter.purchase(req);
  if (first.status !== "unknown") return { outcome: first, retryable: false };
  const check = await adapter.status(req.requestId);
  if (check.status === "not_found")
    return { outcome: { ...first, status: "unknown" }, retryable: true };
  if (check.status === "unknown") return { outcome: check, retryable: false };
  return { outcome: check, retryable: false };
}

/**
 * Use this for every later try of an order that was already sent once. It checks the provider first and only
 * buys again when the provider says it has never seen the request id.
 */
export async function retryPurchase(
  adapter: ProviderAdapter,
  req: PurchaseRequest,
): Promise<{ outcome: PurchaseOutcome; sentAgain: boolean }> {
  const check = await adapter.status(req.requestId);
  if (check.status !== "not_found") return { outcome: check, sentAgain: false };
  const { outcome } = await attemptPurchase(adapter, req);
  return { outcome, sentAgain: true };
}

/**
 * The id sent to the fulfilment provider for an order, made ONCE at the first attempt and stored on the order.
 * VTpass needs a Lagos date-time prefix; the others can use the order number.
 */
export function requestIdFor(providerKey: string, orderNumber: string) {
  return providerKey === "vtpass" ? vtpassRequestId(orderNumber) : orderNumber;
}

export type { ProviderAdapter } from "./types";
