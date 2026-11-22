import { randomBytes } from "node:crypto";

import { explorerTxUrl } from "../coins";
import { connectDb, withTx } from "../db";
import { emails } from "../email/templates";
import { log } from "../log";
import { Asset, Deposit, User } from "../models";
import { formatDateTime, formatUsd } from "../money";
import {
  callbackUrl,
  createPayment,
  paymentsConfigured,
  providerCode,
} from "../payments/nowpayments";
import { credit } from "./ledger";
import { audit, mailAdmins, notify } from "./notify";
import { formatCrypto, quote } from "./prices";

type Actor = { id: string; email: string };

export async function activeAssets() {
  await connectDb();
  const assets = await Asset.find({ active: true }).sort({ symbol: 1 }).lean();
  return assets
    .map((a) => ({
      symbol: a.symbol as string,
      name: a.name as string,
      networks: (
        a.networks as {
          name: string;
          address: string;
          memo?: string;
          providerCode?: string;
          active: boolean;
        }[]
      )
        .filter(
          (n) =>
            n.active &&
            (n.address ||
              (paymentsConfigured() &&
                providerCode(a.symbol as string, n.name, n.providerCode))),
        )
        .map((n) => ({ name: n.name, address: n.address, memo: n.memo ?? "" })),
    }))
    .filter((a) => a.networks.length > 0);
}

export const PAYMENT_WINDOW_MIN = 30;
export const MIN_DEPOSIT_CENTS = 1000;
const MAX_OPEN = 3;

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newReference = () =>
  `DEP-${Array.from(randomBytes(6), (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;

/** Marks unpaid payments whose window has closed. Cheap and idempotent, so it runs whenever they are read. */
export async function expireStale(userId?: string) {
  await connectDb();
  await Deposit.updateMany(
    {
      status: "awaiting",
      expiresAt: { $lt: new Date() },
      ...(userId ? { userId } : {}),
    },
    { status: "expired" },
  );
}

/** A quote for the checkout screen. Null when no live price is available for a non-stable asset. */
export async function quoteDeposit(symbol: string, amountCents: number) {
  return quote(symbol, amountCents / 100);
}

/**
 * Step 1 of a deposit: creates the payment (like an invoice) with a quote locked for a short window.
 * Nothing reaches our team until the user submits it.
 */
export async function createDeposit(
  userId: string,
  input: { asset: string; network: string; amountCents: number },
) {
  await connectDb();
  if (input.amountCents < MIN_DEPOSIT_CENTS)
    throw new Error(`The minimum deposit is ${formatUsd(MIN_DEPOSIT_CENTS)}.`);
  const asset = await Asset.findOne({ symbol: input.asset, active: true });
  const auto = (n: { name: string; providerCode?: string }) =>
    paymentsConfigured()
      ? providerCode(input.asset, n.name, n.providerCode)
      : null;
  const net = asset?.networks.find(
    (n: {
      name: string;
      active: boolean;
      address: string;
      providerCode?: string;
    }) => n.name === input.network && n.active && (n.address || auto(n)),
  );
  if (!asset || !net)
    throw new Error("This asset or network is not available right now.");
  const code = auto(net);

  await expireStale(userId);
  const open = await Deposit.countDocuments({ userId, status: "awaiting" });
  if (open >= MAX_OPEN)
    throw new Error(
      "You have several unpaid payments open. Finish or cancel one before starting another.",
    );

  for (let i = 0; i < 5; i++) {
    const reference = newReference();
    try {
      if (code) {
        // Online payment: the provider creates a fresh address and amount, and tells us when it is paid.
        let p;
        try {
          p = await createPayment({
            usd: input.amountCents / 100,
            currency: code,
            orderId: reference,
            description: `Deposit ${reference}`,
            callbackUrl: callbackUrl(),
          });
        } catch (e) {
          log.error("[payments] create failed", e);
          throw new Error(
            e instanceof Error && /amount|minimal|min/i.test(e.message)
              ? "That amount is too small for this coin. Try a larger amount or another coin."
              : "We could not create this payment right now. Please try again in a moment.",
          );
        }
        return await Deposit.create({
          userId,
          asset: input.asset,
          network: input.network,
          address: p.address,
          memo: p.extraId,
          amountCents: input.amountCents,
          cryptoAmount: p.payAmount,
          rate: p.payAmount ? input.amountCents / 100 / p.payAmount : undefined,
          reference,
          provider: "nowpayments",
          providerPaymentId: p.id,
          providerStatus: "waiting",
          expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MIN * 60_000),
          status: "awaiting",
        });
      }
      const q = await quote(input.asset, input.amountCents / 100);
      if (!q)
        throw new Error(
          "A live exchange rate is not available for this asset right now. Try again in a moment, or choose a stablecoin such as USDT.",
        );
      return await Deposit.create({
        userId,
        asset: input.asset,
        network: input.network,
        address: net.address,
        memo: net.memo || undefined,
        amountCents: input.amountCents,
        cryptoAmount: q.cryptoAmount,
        rate: q.rate,
        reference,
        expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MIN * 60_000),
        status: "awaiting",
      });
    } catch (e) {
      if (!(e instanceof Error && /E11000|duplicate key/i.test(e.message)))
        throw e;
    }
  }
  throw new Error("Could not create the payment. Please try again.");
}

/** Step 2: the user says they sent the funds. Now it goes to our team for verification. */
export async function submitDeposit(userId: string, id: string, txRef: string) {
  await connectDb();
  const d = await Deposit.findOne({ _id: id, userId });
  if (!d) throw new Error("Payment not found.");
  if (d.provider)
    throw new Error(
      "This payment is detected automatically. You do not need to submit it.",
    );
  if (!["awaiting", "expired"].includes(d.status))
    throw new Error("This payment was already submitted.");
  // After the window closes we still accept it, but only with a transaction ID so we can find the funds.
  if (d.status === "expired" && txRef.trim().length < 6) {
    throw new Error(
      "This payment window has closed. If you already sent funds, enter the transaction ID so we can review it.",
    );
  }
  d.status = "pending";
  d.txRef = txRef.trim();
  d.submittedAt = new Date();
  await d.save();

  const amount = formatUsd(d.amountCents);
  const u = await User.findById(userId).select("email");
  await notify(
    userId,
    {
      title: "Payment submitted",
      body: `${d.reference} · ${amount} in ${d.asset} is being verified.`,
      href: `/dashboard/transactions`,
    },
    emails.depositReceived(amount, d.asset, d.network),
  );
  await mailAdmins(
    emails.adminNewDeposit({
      id: String(d._id),
      reference: d.reference ?? "",
      user: u?.email ?? "Unknown user",
      amount,
      expected: d.cryptoAmount
        ? formatCrypto(d.asset, d.cryptoAmount)
        : "Not quoted",
      asset: d.asset,
      network: d.network,
      address: d.address ?? undefined,
      txRef: d.txRef || undefined,
      explorerUrl: d.txRef ? explorerTxUrl(d.network, d.txRef) : null,
      submittedAt: formatDateTime(d.submittedAt ?? new Date()),
    }),
  );
  return d;
}

export async function cancelDeposit(userId: string, id: string) {
  await connectDb();
  const res = await Deposit.updateOne(
    { _id: id, userId, status: "awaiting" },
    { status: "cancelled" },
  );
  if (!res.matchedCount)
    throw new Error("Only an unpaid payment can be cancelled.");
}

/**
 * Approves a verified deposit and credits the balance. `creditCents` lets an admin credit what really arrived
 * when it differs from the requested amount; it defaults to the requested amount.
 */
export async function approveDeposit(
  admin: Actor,
  id: string,
  creditCents?: number,
) {
  const dep = await withTx(async (session) => {
    const existing = await Deposit.findOne({
      _id: id,
      status: "pending",
    }).session(session ?? null);
    if (!existing) throw new Error("Deposit is not pending.");
    const credited = creditCents ?? existing.amountCents;
    if (!Number.isInteger(credited) || credited < 1 || credited > 100_000_000)
      throw new Error("Enter a valid amount to credit.");
    const d = await Deposit.findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        status: "approved",
        creditedCents: credited,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      },
      { new: true, session },
    );
    if (!d) throw new Error("Deposit is not pending.");
    await credit(session, d.userId, credited, "deposit", {
      refType: "deposit",
      refId: d._id,
    });
    return d;
  });
  await announceApproved(dep, admin);
}

/** Everything that follows a credit: notice, email and the audit entry. */
async function announceApproved(
  dep: {
    _id: unknown;
    userId: unknown;
    asset: string;
    network: string;
    reference?: string | null;
    amountCents: number;
    creditedCents?: number | null;
    reviewedAt?: Date | null;
  },
  admin: Actor | null,
) {
  const credited = dep.creditedCents ?? dep.amountCents;
  const amount = formatUsd(credited);
  const owner = await User.findById(dep.userId).select("balanceCents").lean();
  await notify(
    String(dep.userId),
    {
      title: "Deposit confirmed",
      body: `${amount} in ${dep.asset} was credited.`,
      href: "/dashboard/transactions",
    },
    emails.depositApproved({
      amount,
      asset: dep.asset,
      network: dep.network,
      reference: dep.reference ?? undefined,
      requested: formatUsd(dep.amountCents),
      balance:
        owner?.balanceCents != null ? formatUsd(owner.balanceCents) : undefined,
      date: formatDateTime(dep.reviewedAt ?? new Date()),
    }),
  );
  await audit(admin, "deposit.approve", String(dep._id), {
    requestedCents: dep.amountCents,
    creditedCents: credited,
  });
}

/**
 * Credits a deposit confirmed by the payment provider. Safe to call more than once: only the first call
 * credits. Late payments (after our window closed) are credited too, because the funds really arrived.
 */
export async function settleDeposit(id: string, creditCents?: number) {
  const dep = await withTx(async (session) => {
    const existing = await Deposit.findOne({
      _id: id,
      status: { $in: ["awaiting", "pending", "expired"] },
    }).session(session ?? null);
    if (!existing) return null;
    const credited = creditCents ?? existing.amountCents;
    const d = await Deposit.findOneAndUpdate(
      { _id: id, status: { $in: ["awaiting", "pending", "expired"] } },
      {
        status: "approved",
        creditedCents: credited,
        reviewedAt: new Date(),
        submittedAt: existing.submittedAt ?? new Date(),
      },
      { new: true, session },
    );
    if (!d) return null;
    await credit(session, d.userId, credited, "deposit", {
      refType: "deposit",
      refId: d._id,
    });
    return d;
  });
  if (!dep) return false;
  await announceApproved(dep, null);
  return true;
}

/** The provider reports the payment failed or was refunded. Nothing was credited. */
export async function failDeposit(id: string, reason: string) {
  await connectDb();
  const d = await Deposit.findOneAndUpdate(
    { _id: id, status: { $in: ["awaiting", "pending"] } },
    { status: "rejected", reason, reviewedAt: new Date() },
    { new: true },
  );
  if (!d) return false;
  await notify(
    String(d.userId),
    {
      title: "Deposit not completed",
      body: reason,
      href: `/dashboard/transactions`,
    },
    emails.depositRejected(formatUsd(d.amountCents), reason),
  );
  await audit(null, "deposit.fail", String(d._id), { reason });
  return true;
}

export async function rejectDeposit(admin: Actor, id: string, reason: string) {
  await connectDb();
  const d = await Deposit.findOneAndUpdate(
    { _id: id, status: "pending" },
    {
      status: "rejected",
      reason,
      reviewedBy: admin.id,
      reviewedAt: new Date(),
    },
    { new: true },
  );
  if (!d) throw new Error("Deposit is not pending.");
  const amount = formatUsd(d.amountCents);
  await notify(
    String(d.userId),
    {
      title: "Deposit not confirmed",
      body: reason || undefined,
      href: "/dashboard/transactions",
    },
    emails.depositRejected(amount, reason),
  );
  await audit(admin, "deposit.reject", String(d._id), { reason });
}
