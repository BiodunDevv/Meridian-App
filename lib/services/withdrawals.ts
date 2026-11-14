import { randomBytes } from "node:crypto";

import { MEMO_HINTS } from "../coins";
import { connectDb, withTx } from "../db";
import { emails } from "../email/templates";
import { Asset, Kyc, User, Withdrawal } from "../models";
import { formatUsd } from "../money";
import {
  callbackUrl,
  createPayout,
  payoutsConfigured,
  providerCode,
} from "../payments/nowpayments";
import { credit, debit } from "./ledger";
import { alertAdmins, audit, notify } from "./notify";
import { getPaymentSettings } from "./payments";
import { quote } from "./prices";

type Actor = { id: string; email: string };

export const MIN_WITHDRAWAL_CENTS = 1000;

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newReference = () =>
  `WDR-${Array.from(randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;

export async function kycStatus(userId: string) {
  await connectDb();
  const k = await Kyc.findOne({ userId }).lean();
  return (
    (k?.status as "pending" | "approved" | "rejected" | undefined) ?? "none"
  );
}

export async function requestWithdrawal(
  userId: string,
  input: {
    asset: string;
    network: string;
    address: string;
    amountCents: number;
  },
) {
  if ((await kycStatus(userId)) !== "approved") {
    throw new Error("Verify your identity before requesting a withdrawal.");
  }
  if (input.amountCents < MIN_WITHDRAWAL_CENTS) {
    throw new Error(
      `The minimum withdrawal is ${formatUsd(MIN_WITHDRAWAL_CENTS)}.`,
    );
  }
  const w = await withTx(async (session) => {
    const [w] = await Withdrawal.create(
      [{ userId, ...input, reference: newReference() }],
      {
        session,
      },
    );
    await debit(session, userId, input.amountCents, "withdrawal_hold", {
      refType: "withdrawal",
      refId: w._id,
    });
    return w;
  });
  const amount = formatUsd(input.amountCents);
  const u = await User.findById(userId).select("email");
  await notify(
    userId,
    {
      title: "Withdrawal requested",
      body: `${amount} is on hold while we review it.`,
      href: `/dashboard/withdraw/${w._id}`,
    },
    emails.withdrawalRequested(
      amount,
      input.asset,
      input.network,
      input.address,
    ),
  );
  await alertAdmins(
    "New withdrawal to review",
    [
      ["User", u?.email ?? ""],
      ["Amount", amount],
      ["Asset", `${input.asset} · ${input.network}`],
    ],
    "/admin/withdrawals",
  );
  // Pay it automatically when it passes the safety checks. Otherwise it waits for a person.
  await tryAutoPayout(String(w._id)).catch((e) =>
    console.error("[payout] auto failed", e),
  );
  return w;
}

const DAY_MS = 86_400_000;

type NetRow = { name: string; providerCode?: string };

async function networkOverride(asset: string, network: string) {
  const a = await Asset.findOne({ symbol: asset }).lean();
  return (a?.networks as NetRow[] | undefined)?.find((n) => n.name === network)
    ?.providerCode;
}

/** Why this request must be reviewed by a person, or null when it is safe to pay automatically. */
async function reviewReason(w: {
  _id: unknown;
  userId: unknown;
  asset: string;
  network: string;
  address: string;
  amountCents: number;
}): Promise<string | null> {
  if (!payoutsConfigured()) return "Automatic payouts are not set up.";
  const s = await getPaymentSettings();
  if (!s.autoWithdraw) return "Automatic payouts are switched off.";
  if (MEMO_HINTS[w.asset.toUpperCase()])
    return `${w.asset} payouts need a memo or tag, so a person must send them.`;
  const override = await networkOverride(w.asset, w.network);
  if (!providerCode(w.asset, w.network, override))
    return "This network is not supported for automatic payouts.";
  const usd = w.amountCents / 100;
  if (usd > s.maxUsd)
    return `Above the automatic limit of $${s.maxUsd.toLocaleString("en-US")}.`;
  const since = new Date(Date.now() - DAY_MS);
  const [day] = await Withdrawal.aggregate([
    {
      $match: {
        userId: w.userId,
        _id: { $ne: w._id },
        status: { $in: ["processing", "paid"] },
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: null, cents: { $sum: "$amountCents" } } },
  ]);
  if (((day?.cents ?? 0) + w.amountCents) / 100 > s.dailyUsd)
    return `Would pass the daily automatic limit of $${s.dailyUsd.toLocaleString("en-US")}.`;
  const paidBefore = await Withdrawal.exists({
    userId: w.userId,
    address: w.address,
    status: "paid",
  });
  if (!paidBefore && usd > s.newAddressMaxUsd)
    return `New address above $${s.newAddressMaxUsd.toLocaleString("en-US")}. Check it before paying.`;
  return null;
}

/** Sends the payout through the provider if the request passes every check. A normal hold is not an error. */
export async function tryAutoPayout(id: string) {
  // Without payouts set up (or switched off) every withdrawal simply goes to the review queue.
  if (!payoutsConfigured() || !(await getPaymentSettings()).autoWithdraw)
    return false;
  await connectDb();
  // Claim it so two requests can never pay the same withdrawal.
  const w = await Withdrawal.findOneAndUpdate(
    {
      _id: id,
      status: "pending",
      providerPayoutId: { $exists: false },
      providerStatus: { $exists: false },
    },
    { providerStatus: "dispatching" },
    { new: true },
  );
  if (!w) return false;
  const hold = async (reason: string, alert = false) => {
    await Withdrawal.updateOne(
      { _id: w._id },
      { holdReason: reason, $unset: { providerStatus: 1 } },
    );
    if (alert) {
      const u = await User.findById(w.userId).select("email");
      await alertAdmins(
        "Withdrawal needs a person",
        [
          ["User", u?.email ?? ""],
          ["Amount", formatUsd(w.amountCents)],
          ["Reason", reason],
        ],
        `/admin/withdrawals/${w._id}`,
      );
    }
    return false;
  };
  const reason = await reviewReason(w);
  if (reason) return hold(reason);

  const override = await networkOverride(w.asset, w.network);
  const code = providerCode(w.asset, w.network, override)!;
  const q = await quote(w.asset, w.amountCents / 100);
  if (!q) return hold("No live exchange rate for this coin right now.", true);
  // Round down so the payout never pays more than the amount held.
  const amount = Math.max(
    0,
    Math.floor((w.amountCents / 100 / q.rate) * 1e8) / 1e8,
  );
  try {
    const p = await createPayout({
      address: w.address,
      currency: code,
      amount,
      callbackUrl: callbackUrl(),
    });
    await Withdrawal.updateOne(
      { _id: w._id },
      {
        status: "processing",
        provider: "nowpayments",
        providerBatchId: p.batchId,
        providerPayoutId: p.payoutId,
        providerStatus: p.status,
        cryptoAmount: amount,
        reviewedAt: new Date(),
        $unset: { holdReason: 1 },
      },
    );
    await audit(null, "withdrawal.auto_sent", String(w._id), {
      amount,
      currency: code,
      verified: p.verified,
    });
    return true;
  } catch (e) {
    console.error("[payout] create failed", e);
    return hold(
      e instanceof Error
        ? `Automatic payout failed: ${e.message}`
        : "Automatic payout failed.",
      true,
    );
  }
}

/** The provider finished sending. Records the transaction and tells the user. */
export async function settlePayout(id: string, txHash: string) {
  await connectDb();
  const w = await Withdrawal.findOneAndUpdate(
    { _id: id, status: { $in: ["processing", "pending"] } },
    {
      status: "paid",
      txHash: txHash || "sent",
      providerStatus: "finished",
      reviewedAt: new Date(),
      $unset: { holdReason: 1 },
    },
    { new: true },
  );
  if (!w) return false;
  const amount = formatUsd(w.amountCents);
  await notify(
    String(w.userId),
    {
      title: "Withdrawal paid",
      body: amount,
      href: `/dashboard/withdraw/${w._id}`,
    },
    emails.withdrawalPaid(amount, w.txHash),
  );
  await audit(null, "withdrawal.paid", String(w._id), { txHash });
  return true;
}

/**
 * The provider could not send it. We do NOT refund automatically (it may be a partial failure), so it goes back
 * to the review queue for a person to retry, pay by hand or reject.
 */
export async function holdFailedPayout(id: string, reason: string) {
  await connectDb();
  const w = await Withdrawal.findOneAndUpdate(
    { _id: id, status: "processing" },
    {
      status: "pending",
      holdReason: reason,
      providerStatus: "failed",
      $unset: { providerPayoutId: 1 },
    },
    { new: true },
  );
  if (!w) return false;
  const u = await User.findById(w.userId).select("email");
  await alertAdmins(
    "Automatic payout failed",
    [
      ["User", u?.email ?? ""],
      ["Amount", formatUsd(w.amountCents)],
      ["Reason", reason],
    ],
    `/admin/withdrawals/${w._id}`,
  );
  return true;
}

export async function markWithdrawalPaid(
  admin: Actor,
  id: string,
  txHash: string,
) {
  await connectDb();
  const w = await Withdrawal.findOneAndUpdate(
    { _id: id, status: "pending" },
    { status: "paid", txHash, reviewedBy: admin.id, reviewedAt: new Date() },
    { new: true },
  );
  if (!w) throw new Error("Withdrawal is not pending.");
  const amount = formatUsd(w.amountCents);
  await notify(
    String(w.userId),
    {
      title: "Withdrawal paid",
      body: amount,
      href: `/dashboard/withdraw/${w._id}`,
    },
    emails.withdrawalPaid(amount, txHash),
  );
  await audit(admin, "withdrawal.paid", String(w._id), {
    txHash,
    amountCents: w.amountCents,
  });
}

export async function rejectWithdrawal(
  admin: Actor,
  id: string,
  reason: string,
) {
  const w = await withTx(async (session) => {
    const x = await Withdrawal.findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        status: "rejected",
        reason,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
      { new: true, session },
    );
    if (!x) throw new Error("Withdrawal is not pending.");
    await credit(session, x.userId, x.amountCents, "withdrawal_refund", {
      refType: "withdrawal",
      refId: x._id,
    });
    return x;
  });
  const amount = formatUsd(w.amountCents);
  await notify(
    String(w.userId),
    {
      title: "Withdrawal rejected",
      body: "The amount returned to your balance.",
      href: "/dashboard/withdraw",
    },
    emails.withdrawalRejected(amount, reason),
  );
  await audit(admin, "withdrawal.reject", String(w._id), { reason });
}
