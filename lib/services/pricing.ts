import { connectDb } from "../db";
import { Setting } from "../models";

/**
 * Pricing rules. Everything here is integer minor units, and percentages are basis points
 * (100 bps = 1%), so there is no floating-point rounding in a price.
 */
export type Markup =
  { type: "percent"; value: number } | { type: "fixed"; value: number };

export interface PricingSettings {
  /** Default markup on cost, in basis points. 500 = 5%. */
  defaultMarkupBps: number;
  /** Floor: a price is never below cost plus this many basis points of cost. */
  minMarginBps: number;
  /** Naira per US dollar. Null until the admin sets it. */
  fxNgnPerUsd: number | null;
}

export const DEFAULT_PRICING: PricingSettings = {
  defaultMarkupBps: 500,
  minMarginBps: 100,
  fxNgnPerUsd: null,
};

export async function getPricingSettings(): Promise<PricingSettings> {
  await connectDb();
  const doc = await Setting.findOne({ key: "pricing" }).lean();
  return {
    ...DEFAULT_PRICING,
    ...((doc?.value as Partial<PricingSettings>) ?? {}),
  };
}

export async function savePricingSettings(v: PricingSettings) {
  await connectDb();
  await Setting.updateOne(
    { key: "pricing" },
    { key: "pricing", value: v },
    { upsert: true },
  );
}

const ceilDiv = (a: number, b: number) => Math.floor((a + b - 1) / b);

/** The markup in force: the product's own, else its category's, else the default. */
export function effectiveMarkup(
  product: { markup?: Markup | null } | null | undefined,
  category: { markup?: Markup | null } | null | undefined,
  settings: Pick<PricingSettings, "defaultMarkupBps">,
): { markup: Markup; source: "product" | "category" | "default" } {
  if (product?.markup) return { markup: product.markup, source: "product" };
  if (category?.markup) return { markup: category.markup, source: "category" };
  return {
    markup: { type: "percent", value: settings.defaultMarkupBps },
    source: "default",
  };
}

export interface PriceResult {
  costMinor: number;
  priceMinor: number;
  marginMinor: number;
  /** True when the markup was too small and the minimum margin floor set the price. */
  floored: boolean;
}

/**
 * The customer price for a given cost: cost plus markup, rounded up, and never below
 * cost plus the minimum margin. Throws on a cost that is not a positive integer.
 */
export function computePrice(
  costMinor: number,
  markup: Markup,
  minMarginBps: number,
): PriceResult {
  if (!Number.isSafeInteger(costMinor) || costMinor <= 0)
    throw new Error("Cost must be a positive whole number of minor units.");
  if (!Number.isSafeInteger(markup.value) || markup.value < 0)
    throw new Error("Markup cannot be negative.");
  const add =
    markup.type === "percent"
      ? ceilDiv(costMinor * markup.value, 10_000)
      : markup.value;
  const floorAdd = ceilDiv(costMinor * Math.max(0, minMarginBps), 10_000);
  const finalAdd = Math.max(add, floorAdd);
  return {
    costMinor,
    priceMinor: costMinor + finalAdd,
    marginMinor: finalAdd,
    floored: finalAdd > add,
  };
}

/** Converts a price to the other currency with the admin's rate. Rounds up. Null without a rate. */
export function convertMinor(
  amountMinor: number,
  from: "NGN" | "USD",
  fxNgnPerUsd: number | null,
): number | null {
  if (!fxNgnPerUsd || fxNgnPerUsd <= 0) return null;
  const fxKobo = Math.round(fxNgnPerUsd * 100); // kobo per dollar
  return from === "NGN"
    ? ceilDiv(amountMinor * 100, fxKobo) // kobo -> cents
    : ceilDiv(amountMinor * fxKobo, 100); // cents -> kobo
}

export const bpsToPercent = (bps: number) => bps / 100;
export const percentToBps = (pct: number) => Math.round(pct * 100);
export { formatMinor } from "../money";
