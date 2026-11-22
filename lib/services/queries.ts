import { connectDb } from "../db";
import {
  Asset,
  AuditLog,
  Deposit,
  Kyc,
  LedgerEntry,
  Notification,
  User,
  Withdrawal,
} from "../models";

export const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Customer overview: store balance, recent ledger activity and open payments. */
export async function customerOverview(userId: string) {
  await connectDb();
  const [user, recent, pendingDeposits, unread] = await Promise.all([
    User.findById(userId).lean(),
    LedgerEntry.find({ userId }).sort({ createdAt: -1 }).limit(6).lean(),
    Deposit.countDocuments({ userId, status: "pending" }),
    Notification.countDocuments({ userId, readAt: { $exists: false } }),
  ]);
  return plain({
    available: user?.balanceCents ?? 0,
    pendingDeposits,
    unread,
    recent,
  });
}

export async function adminOverview() {
  await connectDb();
  const sum = (m: Record<string, unknown>, M: typeof Deposit) =>
    M.aggregate([
      { $match: m },
      { $group: { _id: null, t: { $sum: "$amountCents" } } },
    ]);
  const [
    users,
    verified,
    dep,
    wd,
    pendDep,
    pendWd,
    pendKyc,
    recentAudit,
    liveMethods,
  ] = await Promise.all([
    User.countDocuments({ role: "investor" }),
    User.countDocuments({
      role: "investor",
      emailVerifiedAt: { $exists: true },
    }),
    sum({ status: "approved" }, Deposit),
    sum({ status: "paid" }, Withdrawal),
    Deposit.countDocuments({ status: "pending" }),
    Withdrawal.countDocuments({ status: "pending" }),
    Kyc.countDocuments({ status: "pending" }),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).lean(),
    Asset.countDocuments({
      active: true,
      networks: { $elemMatch: { active: true, address: { $ne: "" } } },
    }),
  ]);
  return plain({
    users,
    verified,
    deposits: dep[0]?.t ?? 0,
    withdrawals: wd[0]?.t ?? 0,
    pendDep,
    pendWd,
    pendKyc,
    recentAudit,
    liveMethods,
  });
}
