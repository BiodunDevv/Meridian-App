import type { ClientSession, Types } from "mongoose";

import { LedgerEntry, User } from "../models";

export class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient available balance.");
  }
}

type LedgerType =
  | "deposit"
  | "withdrawal_hold"
  | "withdrawal_refund"
  | "adjustment"
  | "order_refund";

interface Ref {
  refType?: string;
  refId?: Types.ObjectId | string;
  note?: string;
}

/** Credits a balance and records a ledger entry with the running balance. */
export async function credit(
  session: ClientSession | undefined,
  userId: Types.ObjectId | string,
  cents: number,
  type: LedgerType,
  ref: Ref = {},
) {
  const u = await User.findByIdAndUpdate(
    userId,
    { $inc: { balanceCents: cents } },
    { new: true, session },
  );
  if (!u) throw new Error("User not found");
  await LedgerEntry.create(
    [
      {
        userId,
        type,
        amountCents: cents,
        balanceAfterCents: u.balanceCents,
        ...ref,
      },
    ],
    { session },
  );
  return u.balanceCents as number;
}

/** Debits a balance atomically; throws if funds are insufficient. */
export async function debit(
  session: ClientSession | undefined,
  userId: Types.ObjectId | string,
  cents: number,
  type: LedgerType,
  ref: Ref = {},
) {
  const u = await User.findOneAndUpdate(
    { _id: userId, balanceCents: { $gte: cents } },
    { $inc: { balanceCents: -cents } },
    { new: true, session },
  );
  if (!u) throw new InsufficientFundsError();
  await LedgerEntry.create(
    [
      {
        userId,
        type,
        amountCents: -cents,
        balanceAfterCents: u.balanceCents,
        ...ref,
      },
    ],
    { session },
  );
  return u.balanceCents as number;
}
