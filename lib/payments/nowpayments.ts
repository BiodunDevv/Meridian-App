import { createHmac } from "node:crypto";

import { generate } from "otplib";

import { chainOf } from "../coins";
import { safeEqual } from "../crypto";
import { getEnv } from "../env";

/**
 * NOWPayments client (https://nowpayments.io). Used for automatic deposits (payments + IPN callbacks)
 * and automatic withdrawals (payouts). Everything here is optional: without keys the app keeps the
 * manual review flow.
 */

const base = () =>
  getEnv().NOWPAYMENTS_SANDBOX === "true"
    ? "https://api-sandbox.nowpayments.io/v1"
    : "https://api.nowpayments.io/v1";

export const paymentsConfigured = () => {
  const e = getEnv();
  return Boolean(e.NOWPAYMENTS_API_KEY && e.NOWPAYMENTS_IPN_SECRET);
};
export const payoutsConfigured = () => {
  const e = getEnv();
  return Boolean(
    paymentsConfigured() && e.NOWPAYMENTS_EMAIL && e.NOWPAYMENTS_PASSWORD,
  );
};

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      "x-api-key": getEnv().NOWPAYMENTS_API_KEY,
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const m = (json as { message?: string }).message ?? text.slice(0, 160);
    throw new ProviderError(m || `Provider error ${res.status}`, res.status);
  }
  return json as T;
}

/** The callback address we give the provider. Only a public https address is usable; on localhost we send none. */
export function callbackUrl() {
  const url = `${getEnv().NEXT_PUBLIC_SITE_URL}/api/webhooks/payments`;
  return url.startsWith("https://") ? url : undefined;
}

/* ---------- Currency codes ---------- */

const TOKEN_SUFFIX: Record<string, string> = {
  eth: "erc20",
  trx: "trc20",
  bnb: "bsc",
  sol: "sol",
  matic: "matic",
  arb: "arb",
  op: "op",
  base: "base",
  ton: "ton",
  avax: "avax",
};
const NATIVE: Record<string, string> = {
  BTC: "btc",
  ETH: "eth",
  LTC: "ltc",
  DOGE: "doge",
  XRP: "xrp",
  TRX: "trx",
  SOL: "sol",
  BNB: "bnbbsc",
  ADA: "ada",
  DOT: "dot",
  XLM: "xlm",
  TON: "ton",
  AVAX: "avax",
  MATIC: "maticmainnet",
  BCH: "bch",
  DASH: "dash",
  ATOM: "atom",
  NEAR: "near",
  ETC: "etc",
  XMR: "xmr",
  ZEC: "zec",
};

/**
 * The provider's currency code for an asset on a network. An explicit admin override wins; otherwise
 * we guess for common cases (BTC, ETH, SOL, USDT/USDC and DAI on major chains). Null = not supported
 * automatically, so the manual flow is used for that method.
 */
export function providerCode(
  symbol: string,
  network: string,
  override?: string,
): string | null {
  if (override?.trim()) return override.trim().toLowerCase();
  const s = symbol.toUpperCase();
  const chain = chainOf(network);
  if (["USDT", "USDC", "DAI"].includes(s)) {
    if (!chain) return null;
    const suffix = TOKEN_SUFFIX[chain];
    if (!suffix) return null;
    const stable = s.toLowerCase();
    // USDC and DAI on Ethereum use the bare ticker.
    if (chain === "eth" && s !== "USDT") return stable;
    return `${stable}${suffix}`;
  }
  const native = NATIVE[s];
  if (!native) return null;
  // A native coin on a different chain than its own (e.g. a wrapped version) is not guessed.
  if (chain && chain !== s.toLowerCase() && !(s === "BNB" && chain === "bnb"))
    return null;
  return native;
}

/* ---------- Payments (deposits) ---------- */

export interface CreatedPayment {
  id: string;
  address: string;
  payAmount: number;
  payCurrency: string;
  extraId?: string;
}

export async function createPayment(input: {
  usd: number;
  currency: string;
  orderId: string;
  description: string;
  callbackUrl?: string;
}): Promise<CreatedPayment> {
  const r = await call<{
    payment_id: string | number;
    pay_address: string;
    pay_amount: number;
    pay_currency: string;
    payin_extra_id?: string | null;
  }>("/payment", {
    body: {
      price_amount: input.usd,
      price_currency: "usd",
      pay_currency: input.currency,
      order_id: input.orderId,
      order_description: input.description,
      ...(input.callbackUrl ? { ipn_callback_url: input.callbackUrl } : {}),
    },
  });
  return {
    id: String(r.payment_id),
    address: r.pay_address,
    payAmount: Number(r.pay_amount),
    payCurrency: r.pay_currency,
    extraId: r.payin_extra_id ? String(r.payin_extra_id) : undefined,
  };
}

export interface PaymentInfo {
  payment_id: string | number;
  payment_status: string;
  order_id?: string;
  price_amount?: number;
  pay_amount?: number;
  actually_paid?: number;
  outcome_amount?: number;
}

export const getPayment = (id: string) =>
  call<PaymentInfo>(`/payment/${encodeURIComponent(id)}`);

/* ---------- Webhook signature ---------- */

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    );
  return v;
}

/** IPN requests are signed with HMAC-SHA512 over the JSON body with keys sorted, using the IPN secret. */
export function verifyIpn(body: unknown, signature: string | null) {
  const secret = getEnv().NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha512", secret)
    .update(JSON.stringify(sortDeep(body)))
    .digest("hex");
  return safeEqual(expected, signature.trim().toLowerCase());
}

export const signIpn = (body: unknown, secret: string) =>
  createHmac("sha512", secret)
    .update(JSON.stringify(sortDeep(body)))
    .digest("hex");

/* ---------- Payouts (withdrawals) ---------- */

let jwt: { token: string; at: number } | null = null;
async function token() {
  // Provider tokens live about 5 minutes. Reuse for 4.
  if (jwt && Date.now() - jwt.at < 240_000) return jwt.token;
  const e = getEnv();
  const r = await call<{ token: string }>("/auth", {
    body: { email: e.NOWPAYMENTS_EMAIL, password: e.NOWPAYMENTS_PASSWORD },
  });
  jwt = { token: r.token, at: Date.now() };
  return r.token;
}

export interface CreatedPayout {
  batchId: string;
  payoutId: string;
  status: string;
  verified: boolean;
}

export async function createPayout(input: {
  address: string;
  currency: string;
  amount: number;
  extraId?: string;
  callbackUrl?: string;
}): Promise<CreatedPayout> {
  const t = await token();
  const r = await call<{
    id: string | number;
    withdrawals: { id: string | number; status: string }[];
  }>("/payout", {
    token: t,
    body: {
      ...(input.callbackUrl ? { ipn_callback_url: input.callbackUrl } : {}),
      withdrawals: [
        {
          address: input.address,
          currency: input.currency,
          amount: input.amount,
          ...(input.callbackUrl ? { ipn_callback_url: input.callbackUrl } : {}),
          ...(input.extraId ? { extra_id: input.extraId } : {}),
        },
      ],
    },
  });
  const w = r.withdrawals?.[0];
  if (!w) throw new ProviderError("The provider returned no payout.");
  const batchId = String(r.id);
  let verified = false;
  // The provider asks for a 2FA code before it sends. With the authenticator secret we confirm it ourselves.
  const secret = getEnv().NOWPAYMENTS_2FA_SECRET;
  if (secret) {
    await call(`/payout/${encodeURIComponent(batchId)}/verify`, {
      token: t,
      body: { verification_code: await generate({ secret }) },
    });
    verified = true;
  }
  return {
    batchId,
    payoutId: String(w.id),
    status: String(w.status).toLowerCase(),
    verified,
  };
}

export interface PayoutInfo {
  id: string | number;
  status: string;
  hash?: string | null;
  error?: string | null;
}

export async function getPayout(id: string): Promise<PayoutInfo> {
  return call<PayoutInfo>(`/payout/${encodeURIComponent(id)}`, {
    token: await token(),
  });
}

/** For the admin "test connection" button. */
export async function checkConnection() {
  const out: string[] = [];
  const s = await call<{ message?: string }>("/status");
  out.push(`Provider status: ${s.message ?? "ok"}`);
  if (payoutsConfigured()) {
    await token();
    out.push("Payout login works");
  }
  return out;
}
