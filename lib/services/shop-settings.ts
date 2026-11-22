import { connectDb } from "../db";
import { Setting } from "../models";

/**
 * Shop-wide switches and limits. The numbers are placeholders until the owner decides them (see docs/DECISIONS.md),
 * and every one is editable in Admin > Settings. Money is US cents.
 */
export interface ShopSettings {
  /** Master switch. Off by default: nothing can be ordered until an admin turns it on. */
  ordersOpen: boolean;
  /** Pauses ordering for a short time (for example while a provider is down) without changing anything else. */
  maintenance: boolean;
  /** Tier 0 (email verified only): most a customer may order per rolling 24 hours. */
  tier0DailyUsdCents: number;
  /** Tier 1 (identity approved): most per rolling 24 hours. */
  tier1DailyUsdCents: number;
  /** Orders per rolling 24 hours, whatever the size. */
  maxOrdersPerDay: number;
  /** Unpaid orders a customer may have open at once. */
  maxOpenOrders: number;
  /** How long a price and crypto quote are held, in minutes. */
  paymentWindowMin: number;
}

export const DEFAULT_SHOP: ShopSettings = {
  ordersOpen: false,
  maintenance: false,
  tier0DailyUsdCents: 5_000,
  tier1DailyUsdCents: 50_000,
  maxOrdersPerDay: 10,
  maxOpenOrders: 3,
  paymentWindowMin: 30,
};

export async function getShopSettings(): Promise<ShopSettings> {
  await connectDb();
  const doc = await Setting.findOne({ key: "shop" }).lean();
  return { ...DEFAULT_SHOP, ...((doc?.value as Partial<ShopSettings>) ?? {}) };
}

export async function saveShopSettings(v: ShopSettings) {
  await connectDb();
  await Setting.updateOne(
    { key: "shop" },
    { key: "shop", value: v },
    { upsert: true },
  );
}
