import { connectDb } from "../db";
import { getEnv } from "../env";
import { Setting } from "../models";
import { payoutsConfigured } from "../payments/nowpayments";

export interface PaymentSettings {
  /** Pay withdrawals automatically when they pass the safety checks. */
  autoWithdraw: boolean;
  /** Largest single withdrawal paid without a person looking at it, in USD. */
  maxUsd: number;
  /** Most that is paid automatically to one user in 24 hours, in USD. */
  dailyUsd: number;
  /** Largest automatic withdrawal to an address that user has not been paid at before, in USD. */
  newAddressMaxUsd: number;
}

const KEY = "payments";

/** Saved admin settings over the environment defaults. */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  const e = getEnv();
  const defaults: PaymentSettings = {
    autoWithdraw: true,
    maxUsd: e.AUTO_WITHDRAW_MAX_USD,
    dailyUsd: e.AUTO_WITHDRAW_DAILY_USD,
    newAddressMaxUsd: e.AUTO_WITHDRAW_NEW_ADDRESS_MAX_USD,
  };
  try {
    await connectDb();
    const row = await Setting.findOne({ key: KEY }).lean();
    const v = (row?.value ?? {}) as Partial<PaymentSettings>;
    return {
      autoWithdraw:
        typeof v.autoWithdraw === "boolean"
          ? v.autoWithdraw
          : defaults.autoWithdraw,
      maxUsd: Number(v.maxUsd) > 0 ? Number(v.maxUsd) : defaults.maxUsd,
      dailyUsd: Number(v.dailyUsd) > 0 ? Number(v.dailyUsd) : defaults.dailyUsd,
      newAddressMaxUsd:
        Number(v.newAddressMaxUsd) > 0
          ? Number(v.newAddressMaxUsd)
          : defaults.newAddressMaxUsd,
    };
  } catch {
    return defaults;
  }
}

export async function savePaymentSettings(s: PaymentSettings) {
  await connectDb();
  await Setting.updateOne({ key: KEY }, { value: s }, { upsert: true });
}

export const autoWithdrawalsAvailable = payoutsConfigured;
