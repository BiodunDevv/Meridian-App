import { connectDb } from "../db";
import { Deposit, User, Withdrawal } from "../models";
import { formatUsd } from "../money";
import {
  getPayment,
  getPayout,
  type PaymentInfo,
  paymentsConfigured,
  payoutsConfigured,
} from "../payments/nowpayments";
import { failDeposit, settleDeposit } from "./deposits";
import { alertAdmins } from "./notify";
import { holdFailedPayout, settlePayout } from "./withdrawals";

/** Applies a payment provider status to a deposit. Safe to run any number of times, in any order. */
export async function applyPaymentStatus(
  id: string,
  status: string,
  info?: Pick<PaymentInfo, "actually_paid" | "pay_amount">,
) {
  await connectDb();
  const before = await Deposit.findByIdAndUpdate(
    id,
    { providerStatus: status, lastSyncAt: new Date() },
    { new: false },
  );
  if (!before) return;
  switch (status) {
    case "confirming":
    case "confirmed":
    case "sending":
      // Funds were seen on the network and are being confirmed.
      await Deposit.updateOne(
        { _id: id, status: { $in: ["awaiting", "expired"] } },
        { status: "pending", submittedAt: before.submittedAt ?? new Date() },
      );
      break;
    case "finished":
      await settleDeposit(id);
      break;
    case "partially_paid": {
      await Deposit.updateOne(
        { _id: id, status: { $in: ["awaiting", "expired"] } },
        { status: "pending", submittedAt: before.submittedAt ?? new Date() },
      );
      if (before.providerStatus !== "partially_paid") {
        const u = await User.findById(before.userId).select("email");
        await alertAdmins(
          "Underpaid deposit needs a decision",
          [
            ["Reference", before.reference ?? ""],
            ["User", u?.email ?? ""],
            ["Requested", formatUsd(before.amountCents)],
            [
              "Received",
              `${info?.actually_paid ?? "?"} of ${info?.pay_amount ?? "?"} ${before.asset}`,
            ],
          ],
          `/admin/deposits/${id}`,
        );
      }
      break;
    }
    case "failed":
      await failDeposit(id, "The payment failed on the network.");
      break;
    case "refunded":
      await failDeposit(id, "The payment was refunded.");
      break;
    case "expired":
      await Deposit.updateOne(
        { _id: id, status: "awaiting" },
        { status: "expired" },
      );
      break;
    default:
      break; // waiting
  }
}

/** Applies a payout provider status to a withdrawal. */
export async function applyPayoutStatus(
  id: string,
  status: string,
  hash?: string | null,
  error?: string | null,
) {
  await connectDb();
  const s = status.toLowerCase();
  await Withdrawal.updateOne(
    { _id: id },
    { providerStatus: s, lastSyncAt: new Date() },
  );
  if (s === "finished") await settlePayout(id, hash ?? "");
  else if (s === "failed" || s === "rejected")
    await holdFailedPayout(
      id,
      `The payout ${s}${error ? `: ${error}` : ""}. Check it and retry, pay by hand or reject.`,
    );
}

const FRESH_MS = 10_000;

/** Asks the provider about one deposit now (used when the user opens it, and by the reconcile job). */
export async function syncDeposit(id: string, force = false) {
  if (!paymentsConfigured()) return;
  await connectDb();
  const d = await Deposit.findById(id).lean();
  if (!d?.provider || !d.providerPaymentId) return;
  if (!["awaiting", "pending", "expired"].includes(d.status as string)) return;
  if (
    !force &&
    d.lastSyncAt &&
    Date.now() - new Date(d.lastSyncAt as Date).getTime() < FRESH_MS
  )
    return;
  await Deposit.updateOne({ _id: id }, { lastSyncAt: new Date() });
  try {
    const p = await getPayment(d.providerPaymentId as string);
    await applyPaymentStatus(id, p.payment_status, p);
  } catch (e) {
    console.error("[payments] sync failed", e instanceof Error ? e.message : e);
  }
}

export async function syncWithdrawal(id: string, force = false) {
  if (!payoutsConfigured()) return;
  await connectDb();
  const w = await Withdrawal.findById(id).lean();
  if (!w?.providerPayoutId || w.status !== "processing") return;
  if (
    !force &&
    w.lastSyncAt &&
    Date.now() - new Date(w.lastSyncAt as Date).getTime() < FRESH_MS
  )
    return;
  await Withdrawal.updateOne({ _id: id }, { lastSyncAt: new Date() });
  try {
    const p = await getPayout(w.providerPayoutId as string);
    await applyPayoutStatus(id, p.status, p.hash, p.error);
  } catch (e) {
    console.error("[payouts] sync failed", e instanceof Error ? e.message : e);
  }
}

/** Catches anything a missed callback left behind. Run every few minutes by the cron route. */
export async function reconcilePayments() {
  await connectDb();
  const since = new Date(Date.now() - 3 * 86_400_000);
  const deposits = await Deposit.find({
    provider: "nowpayments",
    status: { $in: ["awaiting", "pending", "expired"] },
    createdAt: { $gte: since },
  })
    .select("_id")
    .limit(100)
    .lean();
  for (const d of deposits) await syncDeposit(String(d._id), true);
  const payouts = await Withdrawal.find({ status: "processing" })
    .select("_id")
    .limit(100)
    .lean();
  for (const w of payouts) await syncWithdrawal(String(w._id), true);
  return { deposits: deposits.length, payouts: payouts.length };
}
