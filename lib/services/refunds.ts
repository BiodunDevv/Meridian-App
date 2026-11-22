import { connectDb, withTx } from "../db";
import { emails } from "../email/templates";
import { Order } from "../models";
import { formatUsd } from "../money";
import { credit } from "./ledger";
import { audit, notify } from "./notify";
import { logEvent } from "./orders";

type Actor = { id: string; email: string } | null;

/**
 * Refunds a paid order to store credit, exactly once.
 *
 * The order is moved to `refunded` and the ledger is credited in ONE transaction. The move is guarded by the
 * order's current state and by "no refund recorded yet", so a second call (a retry, a duplicate callback, two
 * admins) finds nothing to move and credits nothing. Returns null when there was nothing to refund.
 * On a server without transactions (a local standalone database) the guard still prevents a double credit,
 * but a crash between the two writes could skip the credit; use Atlas or a replica set in production.
 */
export async function refundOrderToCredit(
  orderId: string,
  opts: { reason: string; actor?: Actor; type?: "credit" | "crypto" },
) {
  await connectDb();
  const order = await withTx(async (session) => {
    const cur = await Order.findById(orderId)
      .select("amountUsdCents")
      .session(session ?? null)
      .lean();
    if (!cur) return null;
    const orig = (
      await Order.findById(orderId)
        .select("status")
        .session(session ?? null)
        .lean()
    )?.status;
    const o = await Order.findOneAndUpdate(
      {
        _id: orderId,
        status: { $in: ["failed", "review", "paid"] },
        "refund.at": { $exists: false },
      },
      {
        $set: {
          status: "refunded",
          refund: {
            type: opts.type ?? "credit",
            amountMinor: cur.amountUsdCents,
            currency: "USD",
            reason: opts.reason,
            at: new Date(),
          },
        },
      },
      { new: true, session },
    );
    if (!o) return null;
    try {
      await credit(session, o.userId, o.amountUsdCents, "order_refund", {
        refType: "order",
        refId: o._id,
        note: `Refund for ${o.number}`,
      });
    } catch (e) {
      // Without a transaction (a standalone local database) the status change above is not rolled back for us.
      // Put the order back so the refund can be tried again, and nothing is lost or half done.
      if (!session)
        await Order.updateOne(
          { _id: o._id },
          { $set: { status: orig }, $unset: { refund: 1 } },
        );
      throw e;
    }
    return o;
  });
  if (!order) return null;
  await logEvent(order._id, {
    type: opts.type === "crypto" ? "refund.crypto" : "refund.credit",
    actor: opts.actor?.id ?? "system",
    from: undefined,
    to: "refunded",
    message: `Refunded ${formatUsd(order.amountUsdCents)} to store credit. ${opts.reason}`,
    meta: { amountUsdCents: order.amountUsdCents },
  });
  await audit(
    opts.actor ?? null,
    opts.type === "crypto" ? "order.refund_crypto" : "order.refund_credit",
    String(order._id),
    {
      number: order.number,
      amountUsdCents: order.amountUsdCents,
      reason: opts.reason,
    },
  );
  await notify(
    String(order.userId),
    {
      title: "Order refunded",
      body: `${order.number}: ${formatUsd(order.amountUsdCents)} added to your store credit.`,
      href: `/dashboard/orders/${order._id}`,
    },
    emails.orderRefunded({
      number: order.number,
      product: order.snapshot?.productName ?? "your item",
      amount: formatUsd(order.amountUsdCents),
      path: `/dashboard/orders/${order._id}`,
    }),
  );
  return order;
}
