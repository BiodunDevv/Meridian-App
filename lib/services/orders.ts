import { randomBytes } from "node:crypto";

import { connectDb } from "../db";
import {
  Order,
  OrderEvent,
  type OrderStatus,
  Product,
  Provider,
  ServiceCategory,
  User,
} from "../models";
import { createAdapter } from "../providers";
import type { Mode } from "../providers/types";
import { type InputDef } from "./catalogue";
import {
  computePrice,
  convertMinor,
  effectiveMarkup,
  getPricingSettings,
  type Markup,
} from "./pricing";
import { getShopSettings } from "./shop-settings";
import { kycStatus } from "./withdrawals";

/* ---------- State machine ---------- */
/**
 * Where an order may go next. Every change goes through `transition`, which only moves an order out of a state it is
 * really in (an atomic guard), so two callers can never both win. Nothing is ever deleted.
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ["awaiting_payment", "cancelled", "expired"],
  awaiting_payment: ["paid", "expired", "cancelled", "review"],
  paid: ["fulfilling", "review", "refunded"],
  fulfilling: ["delivered", "failed", "review"],
  delivered: [],
  failed: ["refunded", "review", "fulfilling"],
  review: [
    "fulfilling",
    "paid",
    "delivered",
    "refunded",
    "failed",
    "cancelled",
  ],
  // A payment that arrives after the window closed or the order was cancelled is real money: it goes to review.
  expired: ["review"],
  cancelled: ["review"],
  refunded: [],
};

export async function logEvent(
  orderId: unknown,
  e: {
    type: string;
    actor?: string;
    from?: string;
    to?: string;
    message?: string;
    meta?: Record<string, unknown>;
  },
) {
  await OrderEvent.create({ orderId, actor: "system", ...e });
}

/**
 * Moves an order from one of `from` to `to` if it is still in that state. Returns the updated order, or null when
 * someone else already moved it (which is the normal, safe result of a duplicate callback).
 */
export async function transition(
  id: unknown,
  from: OrderStatus | OrderStatus[],
  to: OrderStatus,
  ev: {
    actor?: string;
    type?: string;
    message?: string;
    meta?: Record<string, unknown>;
    set?: Record<string, unknown>;
  } = {},
) {
  const froms = Array.isArray(from) ? from : [from];
  for (const f of froms)
    if (!TRANSITIONS[f].includes(to))
      throw new Error(`An order cannot go from ${f} to ${to}.`);
  await connectDb();
  const doc = await Order.findOneAndUpdate(
    { _id: id, status: { $in: froms } },
    { $set: { status: to, ...(ev.set ?? {}) } },
    { new: true },
  );
  if (!doc) return null;
  await logEvent(doc._id, {
    type: ev.type ?? `status.${to}`,
    actor: ev.actor,
    from: froms.length === 1 ? froms[0] : undefined,
    to,
    message: ev.message,
    meta: ev.meta,
  });
  return doc;
}

/* ---------- Order numbers ---------- */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newOrderNumber = () =>
  `ORD-${Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;

/* ---------- Pricing an order, on the server ---------- */
export interface OrderQuote {
  productId: string;
  productName: string;
  categorySlug: string;
  providerKey: string;
  providerCode: string;
  currency: "NGN" | "USD";
  kind: "fixed" | "open";
  optionLabel: string;
  valueMinor: number;
  costMinor: number;
  priceMinor: number;
  marginMinor: number;
  markupSource: string;
  amountUsdCents: number;
  /** The price in the other currency for display, or null without an FX rate. */
  otherMinor: number | null;
  fxNgnPerUsd: number | null;
  inputs: InputDef[];
  provider: { mode: Mode };
}

export class OrderError extends Error {}

/**
 * Prices one order from the catalogue. The browser sends only a product id and a choice; every number comes from
 * here. Throws a plain-language OrderError when the item cannot be sold right now.
 */
export async function quoteOrder(sel: {
  productId: string;
  option?: string;
  amount?: string;
}): Promise<OrderQuote> {
  await connectDb();
  const product = await Product.findById(sel.productId)
    .lean()
    .catch(() => null);
  if (!product || product.status !== "active")
    throw new OrderError("This item is not available right now.");
  const [cat, provider, settings] = await Promise.all([
    ServiceCategory.findById(product.categoryId).lean(),
    Provider.findOne({ key: product.providerKey }).lean(),
    getPricingSettings(),
  ]);
  if (!cat || !cat.active || !provider || !provider.active)
    throw new OrderError("This item is not available right now.");
  const adapter = createAdapter(provider.key as string, provider.mode as Mode);
  if (!adapter || !adapter.isConfigured())
    throw new OrderError("This item is not available right now.");

  let valueMinor: number;
  let costMinor: number;
  let label: string;
  if (product.kind === "fixed") {
    const d = (product.denominations ?? []).find(
      (x: { label: string }) => x.label === sel.option,
    );
    if (!d) throw new OrderError("Choose one of the listed options.");
    valueMinor = d.valueMinor;
    costMinor = d.costMinor;
    label = d.label;
  } else {
    const n = Number(String(sel.amount ?? "").replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) throw new OrderError("Enter an amount.");
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)
      throw new OrderError("Use at most two decimal places.");
    valueMinor = Math.round(n * 100);
    if (valueMinor < product.minMinor || valueMinor > product.maxMinor)
      throw new OrderError(
        `The amount must be between ${product.minMinor / 100} and ${product.maxMinor / 100}.`,
      );
    costMinor = Math.max(
      1,
      Math.ceil((valueMinor * (product.costBps ?? 10_000)) / 10_000),
    );
    label = `${n}`;
  }
  const { markup, source } = effectiveMarkup(
    product as { markup?: Markup | null },
    cat as { markup?: Markup | null },
    settings,
  );
  const p = computePrice(costMinor, markup, settings.minMarginBps);
  const currency = product.currency as "NGN" | "USD";
  const usd =
    currency === "USD"
      ? p.priceMinor
      : convertMinor(p.priceMinor, "NGN", settings.fxNgnPerUsd);
  if (!usd)
    throw new OrderError(
      "Prices in naira are not available yet because the exchange rate has not been set. Please try again later.",
    );
  return {
    productId: String(product._id),
    productName: product.name as string,
    categorySlug: cat.slug as string,
    providerKey: product.providerKey as string,
    providerCode: product.providerCode as string,
    currency,
    kind: product.kind as "fixed" | "open",
    optionLabel: label,
    valueMinor,
    costMinor,
    priceMinor: p.priceMinor,
    marginMinor: p.marginMinor,
    markupSource: source,
    amountUsdCents: usd,
    otherMinor:
      currency === "NGN"
        ? usd
        : convertMinor(p.priceMinor, "USD", settings.fxNgnPerUsd),
    fxNgnPerUsd: settings.fxNgnPerUsd,
    inputs: ((product.inputs?.length ? product.inputs : cat.inputs) ??
      []) as InputDef[],
    provider: { mode: provider.mode as Mode },
  };
}

/* ---------- Customer inputs ---------- */
const TYPE_PATTERN: Record<string, RegExp> = {
  phone: /^\+?\d{7,15}$/,
  number: /^\d{4,20}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
};

/** Checks the customer's inputs against the product's definitions. Unknown fields are dropped. */
export function validateInputs(
  defs: InputDef[],
  raw: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs) {
    const v = String(raw[d.key] ?? "")
      .trim()
      .slice(0, 200);
    if (!v) {
      if (d.required) throw new OrderError(`${d.label} is required.`);
      continue;
    }
    if (d.type === "select") {
      if (!(d.options ?? []).includes(v))
        throw new OrderError(`Choose a valid ${d.label.toLowerCase()}.`);
    } else if (d.pattern) {
      let ok = false;
      try {
        ok = new RegExp(d.pattern).test(v);
      } catch {
        ok = false;
      }
      if (!ok)
        throw new OrderError(
          `${d.label} does not look right. Check it and try again.`,
        );
    } else if (TYPE_PATTERN[d.type] && !TYPE_PATTERN[d.type].test(v)) {
      throw new OrderError(
        `${d.label} does not look right. Check it and try again.`,
      );
    }
    out[d.key] = v;
  }
  return out;
}

/* ---------- Limits ---------- */
/**
 * Per-customer limits and the KYC gate. Counts only orders that still stand (not cancelled or expired), over a
 * rolling 24 hours. Placeholders live in ShopSettings and are set by the admin.
 */
export async function checkLimits(userId: string, amountUsdCents: number) {
  await connectDb();
  const s = await getShopSettings();
  // Per-customer controls set by an admin come first.
  const me = await User.findById(userId)
    .select("shopBlocked shopLimitUsdCents")
    .lean();
  if (me?.shopBlocked)
    throw new OrderError(
      "Ordering is switched off for your account. Please contact support.",
    );
  const since = new Date(Date.now() - 86_400_000);
  const standing = {
    userId,
    createdAt: { $gte: since },
    status: { $nin: ["cancelled", "expired"] },
  };
  const [open, count, agg, kyc] = await Promise.all([
    Order.countDocuments({
      userId,
      status: { $in: ["created", "awaiting_payment"] },
    }),
    Order.countDocuments(standing),
    Order.aggregate([
      {
        $match: {
          userId: new (await import("mongoose")).Types.ObjectId(userId),
          createdAt: { $gte: since },
          status: { $nin: ["cancelled", "expired"] },
        },
      },
      { $group: { _id: null, t: { $sum: "$amountUsdCents" } } },
    ]),
    kycStatus(userId),
  ]);
  if (open >= s.maxOpenOrders)
    throw new OrderError(
      "You have several unpaid orders open. Pay or cancel one before starting another.",
    );
  if (count >= s.maxOrdersPerDay)
    throw new OrderError(
      "You have reached the daily order limit. Please try again tomorrow.",
    );
  const total = (agg[0]?.t ?? 0) + amountUsdCents;
  // An admin's limit for this customer replaces the tier limits.
  if (typeof me?.shopLimitUsdCents === "number") {
    if (total > me.shopLimitUsdCents)
      throw new OrderError(
        "This order is above the daily limit set for your account. Contact support if you need a higher limit.",
      );
    return s;
  }
  if (kyc !== "approved" && total > s.tier0DailyUsdCents)
    throw new OrderError(
      "This order is above your daily limit. Verify your identity in Settings to raise it.",
    );
  if (total > s.tier1DailyUsdCents)
    throw new OrderError(
      "This order is above the daily limit. Contact support if you need a higher limit.",
    );
  return s;
}

/* ---------- Creating, cancelling and expiring ---------- */
/** Order created, payment not started. The caller then starts the payment (see order-payments). */
export async function createOrderRecord(
  userId: string,
  q: OrderQuote,
  inputs: Record<string, string>,
  idempotencyKey?: string,
) {
  await connectDb();
  for (let i = 0; i < 5; i++) {
    try {
      const order = await Order.create({
        number: newOrderNumber(),
        userId,
        productId: q.productId,
        categorySlug: q.categorySlug,
        snapshot: {
          productName: q.productName,
          providerKey: q.providerKey,
          providerCode: q.providerCode,
          optionLabel: q.optionLabel,
          valueMinor: q.valueMinor,
          costMinor: q.costMinor,
          marginMinor: q.marginMinor,
          markupSource: q.markupSource,
          kind: q.kind,
          fxNgnPerUsd: q.fxNgnPerUsd,
        },
        inputs,
        amountMinor: q.priceMinor,
        currency: q.currency,
        amountUsdCents: q.amountUsdCents,
        status: "created",
        idempotencyKey,
      });
      await logEvent(order._id, {
        type: "created",
        actor: "user",
        to: "created",
        message: "Order created. Price locked.",
      });
      return order;
    } catch (e) {
      if (!(e instanceof Error && /E11000|duplicate key/i.test(e.message)))
        throw e;
    }
  }
  throw new OrderError("Could not create the order. Please try again.");
}

export async function cancelOrder(userId: string, id: string) {
  await connectDb();
  const o = await Order.findOne({ _id: id, userId }).lean();
  if (!o) throw new OrderError("Order not found.");
  const ps = (o.payment as { providerStatus?: string } | undefined)
    ?.providerStatus;
  if (ps && !["waiting", "new"].includes(ps))
    throw new OrderError(
      "A payment for this order is already on its way, so it can no longer be cancelled.",
    );
  const done = await transition(
    id,
    ["created", "awaiting_payment"],
    "cancelled",
    {
      actor: "user",
      message: "Cancelled by the customer before payment.",
    },
  );
  if (!done) throw new OrderError("Only an unpaid order can be cancelled.");
  return done;
}

/** Closes unpaid orders whose window has passed. Skips any whose payment is in flight; those are settled by status sync. */
export async function expireStaleOrders(userId?: string) {
  await connectDb();
  const stale = await Order.find({
    status: { $in: ["created", "awaiting_payment"] },
    "payment.expiresAt": { $lt: new Date() },
    "payment.providerStatus": {
      $nin: [
        "confirming",
        "confirmed",
        "sending",
        "partially_paid",
        "finished",
      ],
    },
    ...(userId ? { userId } : {}),
  })
    .select("_id")
    .limit(200)
    .lean();
  let n = 0;
  for (const o of stale) {
    const done = await transition(
      o._id,
      ["created", "awaiting_payment"],
      "expired",
      {
        message: "The payment window closed without a payment.",
      },
    );
    if (done) n++;
  }
  return n;
}
