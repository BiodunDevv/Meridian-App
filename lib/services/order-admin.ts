import { assertCan, type Permission } from "../auth/permissions";
import { checkAddress } from "../coins";
import { decrypt, encrypt } from "../crypto";
import { connectDb } from "../db";
import { emails } from "../email/templates";
import { Order, OrderEvent } from "../models";
import { formatUsd } from "../money";
import { requestIdFor } from "../providers";
import type { Delivery } from "../providers/types";
import { adapterFor, applyOutcome, fulfilOrder } from "./fulfilment";
import { audit, notify } from "./notify";
import { logEvent, OrderError, transition } from "./orders";
import { formatMinor } from "./pricing";
import { refundOrderToCredit } from "./refunds";
import { requestWithdrawal } from "./withdrawals";

/**
 * What an admin or a staff member can do to an order. Every function takes the ACTOR and checks the permission
 * itself, so the rule holds even if a screen or an action forgets to. Every function writes an audit entry and an
 * order event. Nothing here deletes anything.
 */
export type Actor = { id: string; email: string; role: string };

const need = (a: Actor, p: Permission) => assertCan(a, p);

async function load(id: string) {
  await connectDb();
  const o = await Order.findById(id).lean();
  if (!o) throw new OrderError("Order not found.");
  return o as unknown as {
    _id: unknown;
    userId: unknown;
    number: string;
    status: string;
    amountMinor: number;
    currency: "NGN" | "USD";
    amountUsdCents: number;
    snapshot?: { productName?: string; providerKey?: string };
    fulfilment?: {
      requestId?: string;
      purchaseSentAt?: Date;
      attempts?: number;
    };
    payment?: { providerStatus?: string };
    refund?: { at?: Date };
    delivery?: { encryptedPayload?: string };
    reviewReason?: string;
  };
}

const text = (v: string, label: string, min: number, max = 1000) => {
  const t = v.trim();
  if (t.length < min)
    throw new OrderError(`${label} must be at least ${min} characters.`);
  if (t.length > max) throw new OrderError(`${label} is too long.`);
  return t;
};

/**
 * Tries a stuck or failed order again. It first asks the provider about the earlier attempt and only sends again, with a
 * NEW request id, when the provider says it never took it or definitely refused it. An unclear answer refuses the retry,
 * so a retry can never double-buy.
 */
export async function retryFulfilment(actor: Actor, id: string, note: string) {
  need(actor, "orders.retry");
  const why = text(note, "The reason", 5);
  const o = await load(id);
  if (!["review", "failed"].includes(o.status))
    throw new OrderError("Only an order in review or failed can be retried.");
  if (o.refund?.at) throw new OrderError("This order was already refunded.");
  const key = o.snapshot?.providerKey ?? "";
  const f = o.fulfilment ?? {};
  let resumeSame = false;
  if (f.purchaseSentAt && f.requestId) {
    const a = await adapterFor(key, false);
    const s = await a.status(f.requestId);
    if (s.status === "success") {
      await applyOutcome(id, s);
      await audit(actor, "order.retry_found_delivered", id, { why });
      return "The provider had already delivered it. The order is now delivered.";
    }
    if (s.status === "pending") resumeSame = true;
    else if (s.status === "unknown")
      throw new OrderError(
        "We could not confirm the earlier attempt with the provider. Try again in a moment. Nothing was sent.",
      );
    // not_found or failed: the earlier attempt did not buy anything, so a new request is safe.
  }
  const attempt = (f.attempts ?? 0) + 1;
  const requestId = resumeSame
    ? f.requestId
    : requestIdFor(key, `${o.number}R${attempt}`);
  const moved = await transition(id, ["review", "failed"], "fulfilling", {
    actor: actor.id,
    type: "admin.retry",
    message: `Retry started by ${actor.email}: ${why}`,
    set: {
      "fulfilment.requestId": requestId,
      "fulfilment.nextAttemptAt": new Date(),
      ...(resumeSame ? {} : { "fulfilment.attempts": 0 }),
    },
  });
  if (!moved)
    throw new OrderError(
      "The order changed while you were working. Reload and look again.",
    );
  await Order.updateOne(
    { _id: id },
    {
      $unset: {
        reviewReason: 1,
        ...(resumeSame ? {} : { "fulfilment.purchaseSentAt": 1 }),
      },
    },
  );
  await audit(actor, "order.retry", id, { why, resumeSame, requestId });
  await fulfilOrder(id);
  return resumeSame
    ? "Still pending at the provider. Checking again."
    : "Sent again with a new request.";
}

/**
 * Records a manual delivery (for example an electricity token you got from the provider's own site). Proof is required.
 * An optional code or token is encrypted and shown to the customer on the order page.
 */
export async function markDelivered(
  actor: Actor,
  id: string,
  input: {
    proof: string;
    token?: string;
  },
) {
  need(actor, "orders.mark_delivered");
  const proof = text(input.proof, "The proof", 10);
  const o = await load(id);
  let delivery: Delivery | undefined;
  if (input.token?.trim())
    delivery = { kind: "token", token: input.token.trim() };
  const done = await transition(id, ["fulfilling", "review"], "delivered", {
    actor: actor.id,
    type: "admin.mark_delivered",
    message: `Marked as delivered by ${actor.email}.`,
    meta: { proof },
    set: {
      "fulfilment.deliveredAt": new Date(),
      "fulfilment.providerStatus": "manual",
      ...(delivery
        ? { "delivery.encryptedPayload": encrypt(JSON.stringify(delivery)) }
        : {}),
    },
  });
  if (!done)
    throw new OrderError(
      "Only an order that is being fulfilled or in review can be marked delivered.",
    );
  await Order.updateOne({ _id: id }, { $unset: { reviewReason: 1 } });
  await audit(actor, "order.mark_delivered", id, {
    proof,
    hasCode: Boolean(delivery),
  });
  await notify(
    String(o.userId),
    {
      title: "Order delivered",
      body: `${o.number} was delivered.`,
      href: `/dashboard/orders/${id}`,
    },
    emails.orderDelivered({
      number: o.number,
      product: o.snapshot?.productName ?? "your item",
      path: `/dashboard/orders/${id}`,
      note: delivery
        ? "Your code or token is on the order page. We do not put codes in email."
        : undefined,
    }),
  );
  return "Marked as delivered. The customer was told.";
}

/** Refunds a paid order to store credit. Exactly once, whoever clicks and however often. */
export async function refundCredit(actor: Actor, id: string, reason: string) {
  need(actor, "orders.refund_credit");
  const why = text(reason, "The reason", 5);
  await load(id);
  const r = await refundOrderToCredit(id, {
    reason: why,
    actor: { id: actor.id, email: actor.email },
  });
  if (!r)
    throw new OrderError(
      "This order cannot be refunded (it may already be refunded, or it was never paid).",
    );
  return `Refunded ${formatUsd(r.amountUsdCents)} to the customer's store credit.`;
}

/**
 * Refunds to crypto, admin only. It refunds to store credit (once) and then asks for a withdrawal of that amount through
 * the existing withdrawal flow, which checks identity, the address and limits and pays automatically only if every check
 * passes. If the withdrawal is refused, the money stays as store credit, and the message says why.
 */
export async function refundCrypto(
  actor: Actor,
  id: string,
  input: { asset: string; network: string; address: string; reason: string },
) {
  need(actor, "orders.refund_crypto");
  const why = text(input.reason, "The reason", 5);
  const address = input.address.trim();
  const bad = checkAddress(input.network, address);
  if (bad) throw new OrderError(bad);
  if (!input.asset || !input.network)
    throw new OrderError("Choose the coin and network to refund to.");
  await load(id);
  const r = await refundOrderToCredit(id, {
    reason: `${why} (crypto refund requested)`,
    actor: { id: actor.id, email: actor.email },
    type: "crypto",
  });
  if (!r)
    throw new OrderError(
      "This order cannot be refunded (it may already be refunded, or it was never paid).",
    );
  try {
    await requestWithdrawal(String(r.userId), {
      asset: input.asset,
      network: input.network,
      address,
      amountCents: r.amountUsdCents,
    });
    await logEvent(id, {
      type: "admin.refund_crypto",
      actor: actor.id,
      message: `Crypto refund of ${formatUsd(r.amountUsdCents)} requested to ${input.asset} on ${input.network}.`,
    });
    await audit(actor, "order.refund_crypto_withdrawal", id, {
      asset: input.asset,
      network: input.network,
    });
    return `Refund of ${formatUsd(r.amountUsdCents)} requested as a crypto withdrawal. Follow it under Withdrawals.`;
  } catch (e) {
    await logEvent(id, {
      type: "admin.refund_crypto_failed",
      actor: actor.id,
      message: `The crypto withdrawal was refused: ${e instanceof Error ? e.message : "unknown"}. The money stays as store credit.`,
    });
    throw new OrderError(
      `Refunded to store credit instead, because the crypto withdrawal was refused: ${e instanceof Error ? e.message : "unknown reason"}`,
    );
  }
}

/** Cancels an order that has not been paid. A payment already on its way blocks it. */
export async function cancelUnpaid(actor: Actor, id: string, reason: string) {
  need(actor, "orders.cancel");
  const why = text(reason, "The reason", 5);
  const o = await load(id);
  const ps = o.payment?.providerStatus;
  if (ps && !["waiting", "new"].includes(ps))
    throw new OrderError(
      "A payment for this order is already on its way, so it cannot be cancelled.",
    );
  const done = await transition(
    id,
    ["created", "awaiting_payment"],
    "cancelled",
    {
      actor: actor.id,
      type: "admin.cancel",
      message: `Cancelled by ${actor.email}: ${why}`,
    },
  );
  if (!done) throw new OrderError("Only an unpaid order can be cancelled.");
  await audit(actor, "order.cancel", id, { why });
  return "Order cancelled.";
}

/** An internal note. The customer never sees it. */
export async function addNote(actor: Actor, id: string, note: string) {
  need(actor, "orders.note");
  const t = text(note, "The note", 2);
  await load(id);
  await logEvent(id, {
    type: "note",
    actor: actor.id,
    message: `${actor.email}: ${t}`,
  });
  await audit(actor, "order.note", id);
  return "Note saved.";
}

/** Sends the customer the email that matches the order's current status again. Never includes a code. */
export async function resendEmail(actor: Actor, id: string) {
  need(actor, "orders.resend");
  const o = await load(id);
  const path = `/dashboard/orders/${id}`;
  const product = o.snapshot?.productName ?? "your item";
  const map: Record<string, ReturnType<typeof emails.orderPaid> | undefined> = {
    paid: emails.orderPaid({
      number: o.number,
      product,
      amount: formatMinor(o.amountMinor, o.currency),
      path,
    }),
    fulfilling: emails.orderPaid({
      number: o.number,
      product,
      amount: formatMinor(o.amountMinor, o.currency),
      path,
    }),
    delivered: emails.orderDelivered({ number: o.number, product, path }),
    refunded: emails.orderRefunded({
      number: o.number,
      product,
      amount: formatUsd(o.amountUsdCents),
      path,
    }),
    review: emails.orderNeedsReview({
      number: o.number,
      product,
      reason: "You do not need to pay again.",
      path,
    }),
  };
  const mail = map[o.status];
  if (!mail)
    throw new OrderError("There is no email for an order in this state.");
  await notify(
    String(o.userId),
    { title: "Order update", body: `${o.number}`, href: path },
    mail,
  );
  await logEvent(id, {
    type: "admin.resend",
    actor: actor.id,
    message: `Status email re-sent by ${actor.email}.`,
  });
  await audit(actor, "order.resend_email", id);
  return "Email sent again.";
}

/** Shows a delivered code or token to an admin. Admin only, and every view is audited. */
export async function adminReveal(actor: Actor, id: string) {
  need(actor, "orders.reveal");
  const o = await load(id);
  if (!o.delivery?.encryptedPayload)
    throw new OrderError("There is nothing to show for this order.");
  await audit(actor, "order.admin_reveal", id, { number: o.number });
  await logEvent(id, {
    type: "admin.reveal",
    actor: actor.id,
    message: `${actor.email} viewed the delivery details.`,
  });
  return JSON.parse(decrypt(o.delivery.encryptedPayload)) as Delivery;
}

export async function orderEventsForAdmin(id: string) {
  await connectDb();
  return OrderEvent.find({ orderId: id }).sort({ at: 1 }).lean();
}
