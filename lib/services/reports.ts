import { connectDb } from "../db";
import { Order, Provider, Ticket } from "../models";

/**
 * Business numbers, all in US cents (an order priced in naira is converted with the rate that was used when it was
 * sold). Revenue means DELIVERED orders only, so money for an order that is still being fulfilled, or that was refunded,
 * is never counted as earned. Cost and margin come from the snapshot taken when the order was created.
 */
export type Dim = "day" | "product" | "category" | "provider";

const TZ = "Africa/Lagos";

/** Cost of one order in US cents: the price in cents scaled by cost / price in the order's own currency. */
const COST_USD = {
  $round: [
    {
      $multiply: [
        "$amountUsdCents",
        { $divide: ["$snapshot.costMinor", "$amountMinor"] },
      ],
    },
    0,
  ],
};

export interface ReportRow {
  key: string;
  delivered: number;
  revenue: number;
  cost: number;
  margin: number;
  paid: number;
  refunded: number;
  refundedAmount: number;
  /** refunded orders as a share of paid orders, 0 to 1 */
  refundRate: number;
}

const keyExpr = (dim: Dim, field: string) =>
  dim === "day"
    ? { $dateToString: { format: "%Y-%m-%d", date: field, timezone: TZ } }
    : dim === "product"
      ? "$snapshot.productName"
      : dim === "category"
        ? "$categorySlug"
        : "$snapshot.providerKey";

/** Revenue, cost, margin and refunds grouped by day, product, category or provider, between two dates. */
export async function reportBy(
  dim: Dim,
  from: Date,
  to: Date,
): Promise<ReportRow[]> {
  await connectDb();
  const [delivered, paid, refunded] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          status: "delivered",
          "fulfilment.deliveredAt": { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: keyExpr(dim, "$fulfilment.deliveredAt"),
          delivered: { $sum: 1 },
          revenue: { $sum: "$amountUsdCents" },
          cost: { $sum: COST_USD },
        },
      },
    ]),
    Order.aggregate([
      { $match: { "payment.paidAt": { $gte: from, $lte: to } } },
      { $group: { _id: keyExpr(dim, "$payment.paidAt"), paid: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { "refund.at": { $gte: from, $lte: to } } },
      {
        $group: {
          _id: keyExpr(dim, "$refund.at"),
          refunded: { $sum: 1 },
          amount: { $sum: "$refund.amountMinor" },
        },
      },
    ]),
  ]);
  const rows = new Map<string, ReportRow>();
  const row = (k: string) => {
    let r = rows.get(k);
    if (!r) {
      r = {
        key: k,
        delivered: 0,
        revenue: 0,
        cost: 0,
        margin: 0,
        paid: 0,
        refunded: 0,
        refundedAmount: 0,
        refundRate: 0,
      };
      rows.set(k, r);
    }
    return r;
  };
  for (const d of delivered) {
    const r = row(String(d._id ?? "unknown"));
    r.delivered = d.delivered;
    r.revenue = d.revenue;
    r.cost = d.cost;
    r.margin = d.revenue - d.cost;
  }
  for (const p of paid) row(String(p._id ?? "unknown")).paid = p.paid;
  for (const x of refunded) {
    const r = row(String(x._id ?? "unknown"));
    r.refunded = x.refunded;
    r.refundedAmount = x.amount ?? 0;
  }
  for (const r of rows.values())
    r.refundRate = r.paid ? Math.min(1, r.refunded / r.paid) : 0;
  return [...rows.values()].sort((a, b) =>
    dim === "day" ? a.key.localeCompare(b.key) : b.revenue - a.revenue,
  );
}

export interface Period {
  orders: number;
  delivered: number;
  revenue: number;
  cost: number;
  margin: number;
  refundedAmount: number;
  refunded: number;
  failed: number;
  cryptoReceived: number;
  /** average minutes from payment to delivery, or null when nothing was delivered */
  avgDeliveryMin: number | null;
}

export async function periodStats(from: Date, to: Date): Promise<Period> {
  await connectDb();
  const range = { $gte: from, $lte: to };
  const [orders, del, ref, failed, paid, speed] = await Promise.all([
    Order.countDocuments({ createdAt: range }),
    Order.aggregate([
      { $match: { status: "delivered", "fulfilment.deliveredAt": range } },
      {
        $group: {
          _id: null,
          n: { $sum: 1 },
          revenue: { $sum: "$amountUsdCents" },
          cost: { $sum: COST_USD },
        },
      },
    ]),
    Order.aggregate([
      { $match: { "refund.at": range } },
      {
        $group: {
          _id: null,
          n: { $sum: 1 },
          amount: { $sum: "$refund.amountMinor" },
        },
      },
    ]),
    Order.countDocuments({
      status: { $in: ["failed", "refunded"] },
      updatedAt: range,
    }),
    Order.aggregate([
      { $match: { "payment.paidAt": range } },
      { $group: { _id: null, usd: { $sum: "$amountUsdCents" } } },
    ]),
    Order.aggregate([
      {
        $match: {
          status: "delivered",
          "fulfilment.deliveredAt": range,
          "payment.paidAt": { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          ms: {
            $avg: { $subtract: ["$fulfilment.deliveredAt", "$payment.paidAt"] },
          },
        },
      },
    ]),
  ]);
  const revenue = del[0]?.revenue ?? 0;
  const cost = del[0]?.cost ?? 0;
  return {
    orders,
    delivered: del[0]?.n ?? 0,
    revenue,
    cost,
    margin: revenue - cost,
    refunded: ref[0]?.n ?? 0,
    refundedAmount: ref[0]?.amount ?? 0,
    failed,
    cryptoReceived: paid[0]?.usd ?? 0,
    avgDeliveryMin:
      speed[0]?.ms != null ? Math.round(speed[0].ms / 60_000) : null,
  };
}

/** What a person needs to look at now. */
export async function needsAttention() {
  await connectDb();
  const [
    review,
    failed,
    underpaid,
    openTickets,
    providers,
    awaiting,
    inFlight,
  ] = await Promise.all([
    Order.countDocuments({ status: "review" }),
    Order.countDocuments({ status: "failed" }),
    Order.countDocuments({ status: "review", reviewReason: /Underpaid/i }),
    Ticket.countDocuments({ status: { $ne: "closed" }, unreadByAdmin: true }),
    Provider.find({ active: true }).lean(),
    Order.countDocuments({ status: "awaiting_payment" }),
    Order.countDocuments({ status: { $in: ["paid", "fulfilling"] } }),
  ]);
  const lowFloat = providers.filter(
    (p) =>
      p.lowBalanceMinor &&
      typeof p.lastBalanceMinor === "number" &&
      p.lastBalanceMinor < (p.lowBalanceMinor as number),
  );
  return {
    review,
    failed,
    underpaid,
    openTickets,
    awaiting,
    inFlight,
    lowFloat: lowFloat.map((p) => ({
      key: p.key as string,
      name: p.name as string,
    })),
    providers: providers.map((p) => ({
      key: p.key as string,
      name: p.name as string,
      balance: p.lastBalanceMinor as number | undefined,
      currency: (p.lastBalanceCurrency as "NGN" | "USD") ?? "NGN",
      low: p.lowBalanceMinor as number,
      checkedAt: p.lastCheckedAt as Date | undefined,
    })),
  };
}

export const csvLine = (cells: (string | number)[]) =>
  cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
