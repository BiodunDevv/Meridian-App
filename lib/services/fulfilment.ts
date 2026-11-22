import { decrypt, encrypt } from "../crypto";
import { connectDb } from "../db";
import { emails } from "../email/templates";
import { log } from "../log";
import { Order, Product, Provider, User } from "../models";
import {
  attemptPurchase,
  createAdapter,
  getAdapter,
  requestIdFor,
  retryPurchase,
} from "../providers";
import type {
  Delivery,
  Mode,
  ProviderAdapter,
  PurchaseOutcome,
  PurchaseRequest,
} from "../providers/types";
import { reportError } from "./errors";
import { alertAdmins, audit, notify } from "./notify";
import { logEvent, transition } from "./orders";
import { refundOrderToCredit } from "./refunds";

/**
 * Fulfilment: a paid order is placed with its provider EXACTLY once, then delivered, or refunded exactly once.
 *
 * Safety rules, in the order they matter:
 *  1. Claim: `paid -> fulfilling` is an atomic guard, so only one caller starts an order. The provider request id is
 *     made at that moment and stored, and is never changed.
 *  2. Lease: one worker advances an order at a time (`lockUntil`), so two workers cannot both decide to buy.
 *  3. Mark before send: `purchaseSentAt` is written BEFORE the first POST. If the process dies after it, the order is
 *     known to be "possibly sent", and recovery only asks the provider for the status. It buys again only when the
 *     provider says it has no record of the request id.
 *  4. Outcomes are applied through guarded transitions, so a duplicate callback or a second poll changes nothing.
 */
export const MAX_PURCHASE_ATTEMPTS = 3;
const LEASE_MS = 90_000;
/** Minutes to wait before the next automatic check, by how many have run. */
const BACKOFF_MIN = [1, 5, 15, 60, 180];
/** An order still pending or unclear this long after it was sent goes to a person. */
const STUCK_AFTER_MS = 6 * 3_600_000;
/** Provider refusals that are about OUR side or a passing fault: hold for an admin instead of refunding. */
const HOLD_CODES = new Set([
  "018",
  "030",
  "083",
  "034",
  "035",
  "027",
  "028",
  "087",
  "023",
  "021",
  "022",
  "024",
]);

const backoff = (n: number) =>
  new Date(
    Date.now() + BACKOFF_MIN[Math.min(n, BACKOFF_MIN.length - 1)] * 60_000,
  );

type OrderDoc = {
  _id: unknown;
  userId: unknown;
  number: string;
  status: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  inputs?: Record<string, string>;
  snapshot?: {
    productName?: string;
    providerKey?: string;
    providerCode?: string;
    valueMinor?: number;
    kind?: string;
  };
  fulfilment?: {
    attempts?: number;
    requestId?: string;
    purchaseSentAt?: Date;
    nextAttemptAt?: Date;
    lockUntil?: Date;
  };
};

/** Runs `fn` while holding the order's lease. Returns undefined when another worker holds it. */
async function withLease<T>(
  id: unknown,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const now = new Date();
  const got = await Order.findOneAndUpdate(
    {
      _id: id,
      $or: [
        { "fulfilment.lockUntil": { $exists: false } },
        { "fulfilment.lockUntil": { $lt: now } },
      ],
    },
    { $set: { "fulfilment.lockUntil": new Date(now.getTime() + LEASE_MS) } },
    { new: true },
  ).lean();
  if (!got) return undefined;
  try {
    return await fn();
  } finally {
    await Order.updateOne(
      { _id: id },
      { $unset: { "fulfilment.lockUntil": 1 } },
    );
  }
}

export async function adapterFor(
  providerKey: string,
  forPurchase: boolean,
): Promise<ProviderAdapter> {
  if (forPurchase) return getAdapter(providerKey); // refuses a provider that is switched off: the kill switch
  // Status checks are read-only, so they still work for a provider that was switched off after the order was sent.
  await connectDb();
  const doc = await Provider.findOne({ key: providerKey }).lean();
  const a = doc ? createAdapter(providerKey, doc.mode as Mode) : null;
  if (!a) throw new Error(`No provider "${providerKey}".`);
  return a;
}

function purchaseRequest(o: OrderDoc): PurchaseRequest {
  const s = o.snapshot ?? {};
  return {
    requestId: o.fulfilment?.requestId ?? "",
    orderNumber: o.number,
    providerCode: s.providerCode ?? "",
    kind: s.kind === "fixed" ? "fixed" : "open",
    currency: o.currency,
    valueMinor: s.valueMinor ?? 0,
    inputs: o.inputs ?? {},
  };
}

/* ---------- Claiming ---------- */
/** Moves a paid order to `fulfilling` and fixes its provider request id. Returns null when someone else already did. */
async function claim(id: string) {
  await connectDb();
  const o = await Order.findById(id).select("number snapshot status").lean();
  if (!o || o.status !== "paid") return null;
  const key =
    (o.snapshot as { providerKey?: string } | undefined)?.providerKey ?? "";
  return transition(id, "paid", "fulfilling", {
    message: "Placing the order with our provider.",
    set: {
      "fulfilment.requestId": requestIdFor(key, o.number as string),
      "fulfilment.attempts": 0,
      "fulfilment.nextAttemptAt": new Date(),
    },
  });
}

/* ---------- Applying an outcome ---------- */
function deliveryOf(d?: Delivery) {
  return d && d.kind !== "none" ? encrypt(JSON.stringify(d)) : undefined;
}

/**
 * Applies what the provider said. Safe to call any number of times and from any worker: every move is a guarded
 * transition. Used by the purchase, the status poll, the cron job and the provider callback.
 */
export async function applyOutcome(orderId: string, outcome: PurchaseOutcome) {
  await connectDb();
  const order = (await Order.findById(
    orderId,
  ).lean()) as unknown as OrderDoc | null;
  if (!order) return;
  const attempts = order.fulfilment?.attempts ?? 0;
  const common = {
    "fulfilment.providerStatus": outcome.providerCode ?? outcome.status,
    ...(outcome.providerRef
      ? { "fulfilment.providerRef": outcome.providerRef }
      : {}),
  };
  switch (outcome.status) {
    case "success": {
      const payload = deliveryOf(outcome.delivery);
      const done = await transition(
        orderId,
        ["fulfilling", "review"],
        "delivered",
        {
          message: "Delivered by the provider.",
          meta: { providerRef: outcome.providerRef },
          set: {
            ...common,
            "fulfilment.deliveredAt": new Date(),
            ...(payload ? { "delivery.encryptedPayload": payload } : {}),
          },
        },
      );
      if (!done) return; // already delivered: a duplicate, nothing to do
      const product = await Product.findOne({
        providerKey: order.snapshot?.providerKey,
        providerCode: order.snapshot?.providerCode,
      })
        .select("emailCodes")
        .lean();
      const hasCode = Boolean(payload);
      await notify(
        String(order.userId),
        {
          title: "Order delivered",
          body: `${order.number} was delivered.`,
          href: `/dashboard/orders/${order._id}`,
        },
        emails.orderDelivered({
          number: order.number,
          product: order.snapshot?.productName ?? "your item",
          path: `/dashboard/orders/${order._id}`,
          note:
            hasCode && product?.emailCodes
              ? "Open the order page to see your code."
              : hasCode
                ? "Your code or token is on the order page. We do not put codes in email."
                : undefined,
        }),
      );
      await audit(null, "order.delivered", orderId, { number: order.number });
      return;
    }
    case "pending":
    case "unknown": {
      await Order.updateOne(
        { _id: orderId, status: "fulfilling" },
        {
          $set: {
            ...common,
            "fulfilment.nextAttemptAt": backoff(attempts),
            "fulfilment.lastError":
              outcome.status === "unknown" ? outcome.message : undefined,
          },
        },
      );
      await logEvent(orderId, {
        type: `provider.${outcome.status}`,
        message: outcome.message,
      });
      return;
    }
    case "failed": {
      const hold = outcome.providerCode
        ? HOLD_CODES.has(outcome.providerCode)
        : false;
      if (hold) {
        const moved = await transition(orderId, "fulfilling", "review", {
          message: `The provider could not take the order (${outcome.providerCode}). ${outcome.message}`,
          set: {
            ...common,
            reviewReason: `Provider problem: ${outcome.message}`,
          },
        });
        if (moved)
          await alertReview(order, `Provider problem: ${outcome.message}`);
        return;
      }
      const failed = await transition(orderId, "fulfilling", "failed", {
        message: outcome.message,
        set: common,
      });
      if (!failed) return;
      // Definitely not delivered and not charged: refund to store credit, once.
      await refundOrderToCredit(orderId, { reason: outcome.message });
      await alertAdmins(
        "An order failed and was refunded to store credit",
        [
          ["Order", order.number],
          ["Reason", outcome.message],
        ],
        `/admin/orders/${orderId}`,
      );
      return;
    }
    case "not_found":
      // The provider has no record. Handled by the retry path; nothing to apply.
      return;
  }
}

async function alertReview(order: OrderDoc, reason: string) {
  const u = await User.findById(order.userId).select("email").lean();
  await alertAdmins(
    "An order needs a person",
    [
      ["Order", order.number],
      ["User", u?.email ?? ""],
      ["Reason", reason],
    ],
    `/admin/orders/${order._id}`,
  );
  await notify(
    String(order.userId),
    {
      title: "We are checking your order",
      body: `${order.number}: our team is taking a look.`,
      href: `/dashboard/orders/${order._id}`,
    },
    emails.orderNeedsReview({
      number: order.number,
      product: order.snapshot?.productName ?? "your item",
      reason: "You do not need to pay again.",
      path: `/dashboard/orders/${order._id}`,
    }),
  );
}

/* ---------- Advancing an order ---------- */
async function toReview(order: OrderDoc, reason: string) {
  const moved = await transition(order._id, "fulfilling", "review", {
    message: reason,
    set: { reviewReason: reason },
  });
  if (moved) await alertReview(order, reason);
}

/**
 * Takes one step with a fulfilling order: send it if it was never sent, otherwise ask the provider. Re-buys only when the
 * provider confirms it has no record of the request id, and never more than MAX_PURCHASE_ATTEMPTS times.
 */
async function advance(id: string) {
  await connectDb();
  const order = (await Order.findById(id).lean()) as unknown as OrderDoc | null;
  if (!order || order.status !== "fulfilling") return;
  const f = order.fulfilment ?? {};
  if (!f.requestId) return;
  const providerKey = order.snapshot?.providerKey ?? "";
  const req = purchaseRequest(order);

  // Never sent: it is safe to buy. Mark first, then send.
  if (!f.purchaseSentAt) {
    let adapter: ProviderAdapter;
    try {
      adapter = await adapterFor(providerKey, true);
    } catch (e) {
      // Provider off or unavailable, and nothing was sent. Try again later; hand to a person if it lasts.
      const msg = e instanceof Error ? e.message : "Provider unavailable.";
      await Order.updateOne(
        { _id: id },
        {
          $set: {
            "fulfilment.nextAttemptAt": backoff(f.attempts ?? 0),
            "fulfilment.lastError": msg,
          },
        },
      );
      const paidAt = (await Order.findById(id)
        .select("payment.paidAt")
        .lean()) as { payment?: { paidAt?: Date } } | null;
      if (
        paidAt?.payment?.paidAt &&
        Date.now() - new Date(paidAt.payment.paidAt).getTime() > 24 * 3_600_000
      )
        await toReview(
          order,
          `The provider has been unavailable for a day: ${msg}`,
        );
      return;
    }
    const marked = await Order.findOneAndUpdate(
      { _id: id, "fulfilment.purchaseSentAt": { $exists: false } },
      {
        $set: {
          "fulfilment.purchaseSentAt": new Date(),
          "fulfilment.lastAttemptAt": new Date(),
        },
        $inc: { "fulfilment.attempts": 1 },
      },
      { new: true },
    ).lean();
    if (!marked) return; // someone else marked it first
    await logEvent(id, {
      type: "provider.sent",
      message: "Order sent to the provider.",
    });
    const { outcome } = await attemptPurchase(adapter, req);
    await applyOutcome(id, outcome);
    return;
  }

  // Already sent once: ask first.
  let adapter: ProviderAdapter;
  try {
    adapter = await adapterFor(providerKey, false);
  } catch {
    return;
  }
  const sentAt = new Date(f.purchaseSentAt).getTime();
  if ((f.attempts ?? 0) >= MAX_PURCHASE_ATTEMPTS) {
    const s = await adapter.status(req.requestId);
    if (s.status === "not_found") {
      // The provider never took it, three times over: nothing was bought, so refund.
      const failed = await transition(id, "fulfilling", "failed", {
        message: "The provider never accepted the order after several tries.",
      });
      if (failed)
        await refundOrderToCredit(id, {
          reason: "The provider never accepted the order.",
        });
      return;
    }
    await applyOutcome(id, s);
  } else {
    const { outcome, sentAgain } = await retryPurchase(adapter, req);
    if (sentAgain) {
      await Order.updateOne(
        { _id: id },
        {
          $inc: { "fulfilment.attempts": 1 },
          $set: { "fulfilment.lastAttemptAt": new Date() },
        },
      );
      await logEvent(id, {
        type: "provider.resent",
        message:
          "The provider had no record of the first try, so it was sent again.",
      });
    }
    await applyOutcome(id, outcome);
  }
  // Still going after a long time: a person must look.
  const now = (await Order.findById(id).lean()) as unknown as OrderDoc | null;
  if (now?.status === "fulfilling" && Date.now() - sentAt > STUCK_AFTER_MS)
    await toReview(
      now,
      "The provider has not given a final answer after several hours.",
    );
}

/* ---------- Public entry points ---------- */
/**
 * Starts fulfilment for a paid order: claims it, then sends it. Safe to call from several places at once (the payment
 * callback, a page load, the cron job): only one claims, and only one advances at a time.
 */
export async function fulfilOrder(id: string) {
  await connectDb();
  await claim(id); // null if already claimed: fine, it may still need advancing
  await withLease(id, () => advance(id));
}

/**
 * A read-only check used when the customer opens a fulfilling order, throttled. It asks the provider for the status and
 * applies the answer. It never sends or re-sends a purchase.
 */
export async function pollFulfilment(id: string, force = false) {
  await connectDb();
  const o = (await Order.findById(id).lean()) as unknown as
    (OrderDoc & { fulfilment?: { lastCheckAt?: Date } }) | null;
  if (
    !o ||
    o.status !== "fulfilling" ||
    !o.fulfilment?.requestId ||
    !o.fulfilment.purchaseSentAt
  )
    return;
  const last = (o.fulfilment as { lastCheckAt?: Date }).lastCheckAt;
  if (!force && last && Date.now() - new Date(last).getTime() < 10_000) return;
  await Order.updateOne(
    { _id: id },
    { $set: { "fulfilment.lastCheckAt": new Date() } },
  );
  try {
    const a = await adapterFor(o.snapshot?.providerKey ?? "", false);
    const s = await a.status(o.fulfilment.requestId);
    if (s.status !== "not_found") await applyOutcome(id, s);
  } catch (e) {
    log.error("[fulfilment] poll failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Used by the provider callback. The callback body is never trusted: when the adapter says it has no signature of its
 * own, the result is confirmed with the provider before anything changes.
 */
export async function handleProviderEvent(
  adapter: ProviderAdapter,
  ev: {
    requestId: string;
    outcome: PurchaseOutcome;
    confirmWithStatus: boolean;
  },
) {
  await connectDb();
  const o = await Order.findOne({ "fulfilment.requestId": ev.requestId })
    .select("_id status")
    .lean();
  if (!o) return false;
  const outcome = ev.confirmWithStatus
    ? await adapter.status(ev.requestId)
    : ev.outcome;
  if (outcome.status === "not_found" || outcome.status === "unknown")
    return true; // nothing certain to apply
  await applyOutcome(String(o._id), outcome);
  return true;
}

/**
 * The cron job: claims paid orders a crashed process left behind, advances fulfilling orders that are due, and
 * checks provider float. Returns counts for the log.
 */
export async function runFulfilmentJob(opts: { skipFloat?: boolean } = {}) {
  await connectDb();
  const now = new Date();
  const orphans = await Order.find({
    status: "paid",
    updatedAt: { $lt: new Date(Date.now() - 60_000) },
  })
    .select("_id")
    .limit(50)
    .lean();
  for (const o of orphans)
    await fulfilOrder(String(o._id)).catch((e) =>
      reportError("fulfil.orphan", e, { order: String(o._id) }),
    );
  const due = await Order.find({
    status: "fulfilling",
    $or: [
      { "fulfilment.nextAttemptAt": { $lte: now } },
      { "fulfilment.nextAttemptAt": { $exists: false } },
    ],
  })
    .select("_id")
    .limit(100)
    .lean();
  for (const o of due)
    await withLease(o._id, () => advance(String(o._id))).catch((e) =>
      reportError("fulfil.advance", e, { order: String(o._id) }),
    );
  const float = opts.skipFloat ? undefined : await checkFloat();
  return { claimed: orphans.length, advanced: due.length, float };
}

/** Reads each active provider's balance and warns admins once when it falls below its threshold. */
export async function checkFloat() {
  const { checkProvider } = await import("../providers");
  await connectDb();
  const providers = await Provider.find({ active: true }).lean();
  let low = 0;
  for (const p of providers) {
    if (p.key === "mock") continue;
    const r = await checkProvider(p.key as string).catch(() => null);
    if (!r?.ok || !p.lowBalanceMinor) continue;
    if (r.balance.balanceMinor < (p.lowBalanceMinor as number)) {
      low++;
      const last = p.lastLowAlertAt ? new Date(p.lastLowAlertAt).getTime() : 0;
      if (Date.now() - last > 6 * 3_600_000) {
        await Provider.updateOne(
          { _id: p._id },
          { $set: { lastLowAlertAt: new Date() } },
        );
        await alertAdmins(
          `${p.name} balance is low`,
          [
            ["Balance", String(r.balance.balanceMinor / 100)],
            ["Threshold", String((p.lowBalanceMinor as number) / 100)],
          ],
          "/admin/providers",
        );
      }
    }
  }
  return { checked: providers.length, low };
}

/* ---------- Delivery (codes and tokens) ---------- */
/**
 * Decrypts a delivery for its OWNER. Every call is audited. For products marked view-once the first call consumes it:
 * a second call is refused. Returns null when there is nothing to show.
 */
export async function revealDelivery(userId: string, orderId: string) {
  await connectDb();
  const o = (await Order.findOne({
    _id: orderId,
    userId,
  }).lean()) as unknown as
    | (OrderDoc & { delivery?: { encryptedPayload?: string; viewedAt?: Date } })
    | null;
  if (!o || o.status !== "delivered" || !o.delivery?.encryptedPayload)
    return null;
  const product = await Product.findOne({
    providerKey: o.snapshot?.providerKey,
    providerCode: o.snapshot?.providerCode,
  })
    .select("viewOnce")
    .lean();
  if (product?.viewOnce) {
    // Atomic: only the first reveal gets to set viewedAt.
    const first = await Order.findOneAndUpdate(
      { _id: orderId, userId, "delivery.viewedAt": { $exists: false } },
      { $set: { "delivery.viewedAt": new Date() } },
    );
    if (!first)
      throw new Error(
        "This code was already shown once and cannot be shown again. Contact support if you lost it.",
      );
  } else {
    await Order.updateOne(
      { _id: orderId, "delivery.viewedAt": { $exists: false } },
      { $set: { "delivery.viewedAt": new Date() } },
    );
  }
  await audit({ id: userId, email: "customer" }, "order.reveal", orderId, {
    number: o.number,
  });
  await logEvent(orderId, {
    type: "delivery.revealed",
    actor: "user",
    message: "The customer viewed the delivery details.",
  });
  return JSON.parse(decrypt(o.delivery.encryptedPayload)) as Delivery;
}
