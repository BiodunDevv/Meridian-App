import { connectDb } from "../db";
import { emails } from "../email/templates";
import { getEnv } from "../env";
import { log } from "../log";
import { Asset, Order, User } from "../models";
import {
  callbackUrl,
  createPayment,
  getPayment,
  type PaymentInfo,
  paymentsConfigured,
  providerCode,
} from "../payments/nowpayments";
import { reportError } from "./errors";
import { fulfilOrder } from "./fulfilment";
import { alertAdmins, audit, notify } from "./notify";
import { expireStaleOrders, logEvent, OrderError, transition } from "./orders";
import { formatMinor } from "./pricing";
import { getShopSettings } from "./shop-settings";

type OrderDoc = {
  _id: unknown;
  userId: unknown;
  number: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  amountUsdCents: number;
  status: string;
  snapshot?: { productName?: string };
  payment?: {
    providerStatus?: string;
    payAmount?: number;
    paymentId?: string;
    payAsset?: string;
  };
};

/**
 * The coins a customer can pay an order with: only those the payment provider can create a fresh address for.
 * Orders never use the manual "send and tell us" flow, because an order must be tied to one exact payment.
 */
export async function orderAssets() {
  await connectDb();
  if (!paymentsConfigured()) return [];
  const assets = await Asset.find({ active: true })
    .sort({ sort: 1, symbol: 1 })
    .lean();
  return assets
    .map((a) => ({
      symbol: a.symbol as string,
      name: a.name as string,
      networks: (
        a.networks as { name: string; active: boolean; providerCode?: string }[]
      )
        .filter(
          (n) =>
            n.active &&
            providerCode(a.symbol as string, n.name, n.providerCode),
        )
        .map((n) => ({ name: n.name })),
    }))
    .filter((a) => a.networks.length > 0);
}

/** Creates the payment for an order and moves it to awaiting_payment. The crypto amount is locked by the provider. */
export async function startOrderPayment(
  order: OrderDoc,
  choice: { asset: string; network: string },
) {
  if (!paymentsConfigured())
    throw new OrderError(
      "Payments are not available right now. Please try again later.",
    );
  await connectDb();
  const asset = await Asset.findOne({
    symbol: choice.asset,
    active: true,
  }).lean();
  const net = (
    asset?.networks as
      { name: string; active: boolean; providerCode?: string }[] | undefined
  )?.find((n) => n.name === choice.network && n.active);
  const code = net
    ? providerCode(choice.asset, net.name, net.providerCode)
    : null;
  if (!asset || !net || !code)
    throw new OrderError("This coin or network is not available right now.");
  const settings = await getShopSettings();

  let p;
  try {
    p = await createPayment({
      usd: order.amountUsdCents / 100,
      currency: code,
      orderId: order.number,
      description: `Order ${order.number}`,
      callbackUrl: callbackUrl(),
    });
  } catch (e) {
    log.error(
      "[order-payments] create failed",
      e instanceof Error ? e.message : e,
    );
    throw new OrderError(
      e instanceof Error && /amount|minimal|min/i.test(e.message)
        ? "That amount is too small for this coin. Choose another coin."
        : "We could not create the payment right now. Please try again in a moment.",
    );
  }
  const updated = await transition(order._id, "created", "awaiting_payment", {
    message: `Payment requested in ${choice.asset} on ${choice.network}.`,
    meta: { asset: choice.asset, network: choice.network },
    set: {
      "payment.provider": "nowpayments",
      "payment.paymentId": p.id,
      "payment.address": p.address,
      "payment.memo": p.extraId,
      "payment.payAsset": choice.asset,
      "payment.payNetwork": choice.network,
      "payment.payAmount": p.payAmount,
      "payment.status": "waiting",
      "payment.providerStatus": "waiting",
      "payment.expiresAt": new Date(
        Date.now() + settings.paymentWindowMin * 60_000,
      ),
    },
  });
  if (!updated)
    throw new OrderError("This order can no longer take a payment.");
  return updated;
}

const FULL = 0.99;

async function toReview(
  order: OrderDoc,
  from: string[],
  reason: string,
  alertTitle?: string,
) {
  const done = await transition(order._id, from as never, "review", {
    message: reason,
    set: { reviewReason: reason },
  });
  if (!done) return false;
  const u = await User.findById(order.userId).select("email").lean();
  await alertAdmins(
    alertTitle ?? "An order needs a decision",
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
  return true;
}

/**
 * Applies a payment provider status to an order. Safe to run any number of times, in any order: every move is an
 * atomic guard in `transition`, so a duplicate callback finds the order already moved and does nothing.
 * For `finished` the amount is checked again with the provider, never taken from the callback body alone.
 */
export async function applyOrderPaymentStatus(
  id: string,
  status: string,
  info?: Pick<PaymentInfo, "actually_paid" | "pay_amount" | "price_amount">,
): Promise<"paid" | undefined> {
  let result: "paid" | undefined;
  await connectDb();
  const before = await Order.findByIdAndUpdate(
    id,
    {
      $set: {
        "payment.providerStatus": status,
        "payment.lastSyncAt": new Date(),
      },
    },
    { new: false },
  ).lean();
  if (!before) return;
  const order = before as unknown as OrderDoc;
  switch (status) {
    case "confirming":
    case "confirmed":
    case "sending":
      await Order.updateOne(
        { _id: id },
        { $set: { "payment.status": "confirming" } },
      );
      break;
    case "finished": {
      // Confirm with the provider server to server. A forged or replayed callback cannot get past this.
      let verified:
        | Pick<PaymentInfo, "actually_paid" | "pay_amount" | "price_amount">
        | undefined = info;
      if (paymentsConfigured() && order.payment?.paymentId) {
        const p = await getPayment(order.payment.paymentId);
        if (p.payment_status !== "finished") return;
        verified = p;
      }
      const sandbox = getEnv().NOWPAYMENTS_SANDBOX === "true";
      const wrongPrice =
        verified?.price_amount !== undefined &&
        Math.round(verified.price_amount * 100) !== order.amountUsdCents;
      if (wrongPrice) {
        await toReview(
          order,
          ["awaiting_payment", "expired", "cancelled"],
          "The payment amount does not match the order price.",
          "Order payment does not match the price",
        );
        break;
      }
      const short =
        !sandbox &&
        verified?.pay_amount !== undefined &&
        (verified.actually_paid ?? 0) < verified.pay_amount * FULL;
      if (short) {
        await toReview(
          order,
          ["awaiting_payment", "expired", "cancelled"],
          `Underpaid: received ${verified?.actually_paid ?? 0} of ${verified?.pay_amount} ${order.payment?.payAsset ?? ""}.`.trim(),
          "Underpaid order needs a decision",
        );
        break;
      }
      const paid = await transition(order._id, "awaiting_payment", "paid", {
        message: "Payment confirmed in full.",
        set: {
          "payment.status": "paid",
          "payment.paidAt": new Date(),
          "payment.actuallyPaid": verified?.actually_paid,
        },
      });
      if (paid) {
        result = "paid";
        const over =
          (verified?.actually_paid ?? 0) - (verified?.pay_amount ?? 0);
        if (verified?.pay_amount && over > verified.pay_amount * 0.01) {
          await Order.updateOne(
            { _id: id },
            { $set: { "payment.overpaidBy": over } },
          );
          await logEvent(id, {
            type: "payment.overpaid",
            message: `The customer paid ${over} ${order.payment?.payAsset ?? ""} more than quoted. A person will decide about the difference.`,
          });
        }
        await notify(
          String(order.userId),
          {
            title: "Payment received",
            body: `${order.number}: we are placing your order.`,
            href: `/dashboard/orders/${order._id}`,
          },
          emails.orderPaid({
            number: order.number,
            product: order.snapshot?.productName ?? "your item",
            amount: formatMinor(order.amountMinor, order.currency),
            path: `/dashboard/orders/${order._id}`,
          }),
        );
        await audit(null, "order.paid", String(order._id), {
          number: order.number,
        });
      } else {
        // The order was already expired or cancelled when the money arrived. The money is real: send it to review.
        await toReview(
          order,
          ["expired", "cancelled"],
          "A payment arrived after the order window closed or after it was cancelled.",
          "Late payment on a closed order",
        );
      }
      break;
    }
    case "partially_paid":
      await toReview(
        order,
        ["awaiting_payment", "expired"],
        `Underpaid: received ${info?.actually_paid ?? "?"} of ${info?.pay_amount ?? "?"} ${order.payment?.payAsset ?? ""}.`.trim(),
        "Underpaid order needs a decision",
      );
      break;
    case "failed":
      await transition(order._id, "awaiting_payment", "expired", {
        message: "The payment failed on the network.",
      });
      break;
    case "refunded":
      await toReview(
        order,
        ["awaiting_payment", "expired"],
        "The payment provider reports this payment as refunded.",
      );
      break;
    case "expired":
      await transition(order._id, "awaiting_payment", "expired", {
        message: "The payment window closed.",
      });
      break;
    default:
      break;
  }
  return result;
}

const FRESH_MS = 10_000;

/** Asks the provider about one order's payment now. Used when the customer opens the order and by the reconcile job. */
export async function syncOrderPayment(
  id: string,
  force = false,
): Promise<"paid" | undefined> {
  if (!paymentsConfigured()) return;
  await connectDb();
  const o = await Order.findById(id).lean();
  const pay = o?.payment as
    { paymentId?: string; lastSyncAt?: Date } | undefined;
  if (!o || !pay?.paymentId) return;
  if (
    !["awaiting_payment", "expired", "cancelled"].includes(o.status as string)
  )
    return;
  if (
    !force &&
    pay.lastSyncAt &&
    Date.now() - new Date(pay.lastSyncAt).getTime() < FRESH_MS
  )
    return;
  await Order.updateOne(
    { _id: id },
    { $set: { "payment.lastSyncAt": new Date() } },
  );
  try {
    const p = await getPayment(pay.paymentId);
    await applyOrderPaymentStatus(id, p.payment_status, p);
  } catch (e) {
    log.error(
      "[order-payments] sync failed",
      e instanceof Error ? e.message : e,
    );
  }
}

/** Catches anything a missed callback left behind, then closes unpaid orders whose window ended. */
export async function reconcileOrders() {
  await connectDb();
  const since = new Date(Date.now() - 3 * 86_400_000);
  const open = await Order.find({
    status: { $in: ["awaiting_payment", "expired", "cancelled"] },
    "payment.paymentId": { $exists: true },
    createdAt: { $gte: since },
  })
    .select("_id")
    .limit(100)
    .lean();
  for (const o of open) {
    // A payment found here (a missed callback) is fulfilled straight away.
    if ((await syncOrderPayment(String(o._id), true)) === "paid")
      await fulfilOrder(String(o._id)).catch((e) =>
        reportError("fulfil.reconcile", e),
      );
  }
  const expired = await expireStaleOrders();
  return { orders: open.length, expired };
}
