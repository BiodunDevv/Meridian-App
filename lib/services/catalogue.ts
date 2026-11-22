import { connectDb } from "../db";
import { Product, Provider, ServiceCategory } from "../models";
import {
  computePrice,
  convertMinor,
  effectiveMarkup,
  getPricingSettings,
  type Markup,
  type PricingSettings,
} from "./pricing";

export type InputType = "phone" | "number" | "text" | "email" | "select";
export interface InputDef {
  key: string;
  label: string;
  type: InputType;
  required: boolean;
  pattern?: string;
  options?: string[];
}
export interface Denomination {
  label: string;
  valueMinor: number;
  costMinor: number;
}

const INPUT_TYPES: InputType[] = ["phone", "number", "text", "email", "select"];

/**
 * One input per line: `key | label | type | required | pattern-or-options`.
 * For a select the last part is a comma separated list of options. Example:
 *   phone | Phone number | phone | yes | ^0[789][01]\d{8}$
 */
export function parseInputLines(text: string): InputDef[] {
  const out: InputDef[] = [];
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [key, label, type = "text", req = "yes", extra = ""] = line
      .split("|")
      .map((s) => s.trim());
    if (!/^[a-z][a-zA-Z0-9]{0,29}$/.test(key ?? ""))
      throw new Error(
        `Input key "${key}" must start with a letter and use only letters and numbers.`,
      );
    if (seen.has(key)) throw new Error(`Input key "${key}" is used twice.`);
    if (!label) throw new Error(`Input "${key}" needs a label.`);
    if (!INPUT_TYPES.includes(type as InputType))
      throw new Error(
        `Input "${key}": type must be one of ${INPUT_TYPES.join(", ")}.`,
      );
    seen.add(key);
    const def: InputDef = {
      key,
      label,
      type: type as InputType,
      required: !/^(no|false|n|0)$/i.test(req),
    };
    if (type === "select") {
      def.options = extra
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (def.options.length < 2)
        throw new Error(
          `Input "${key}": give at least two options, separated by commas.`,
        );
    } else if (extra) {
      try {
        new RegExp(extra);
      } catch {
        throw new Error(
          `Input "${key}": the pattern is not a valid regular expression.`,
        );
      }
      def.pattern = extra;
    }
    out.push(def);
  }
  return out;
}

export const inputsToLines = (inputs: InputDef[] = []) =>
  inputs
    .map((i) =>
      [
        i.key,
        i.label,
        i.type,
        i.required ? "yes" : "no",
        i.type === "select" ? (i.options ?? []).join(",") : (i.pattern ?? ""),
      ].join(" | "),
    )
    .join("\n");

const toMinor = (s: string, what: string) => {
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${what} must be a number greater than zero.`);
  return Math.round(n * 100);
};

/** One denomination per line: `label | value | cost` in whole currency units, e.g. `MTN 1.5GB | 1000 | 970`. */
export function parseDenominationLines(text: string): Denomination[] {
  const out: Denomination[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [label, value, cost] = line.split("|").map((s) => s.trim());
    if (!label || !value || !cost)
      throw new Error(
        `Denomination "${line}" must look like: label | value | cost.`,
      );
    const valueMinor = toMinor(value, `Value for "${label}"`);
    const costMinor = toMinor(cost, `Cost for "${label}"`);
    out.push({ label, valueMinor, costMinor });
  }
  return out;
}

export const denominationsToLines = (d: Denomination[] = []) =>
  d
    .map((x) => `${x.label} | ${x.valueMinor / 100} | ${x.costMinor / 100}`)
    .join("\n");

export interface PricedOption {
  label: string;
  valueMinor: number;
  costMinor: number;
  priceMinor: number;
  marginMinor: number;
  floored: boolean;
  /** The price in the other currency, or null until an FX rate is set. */
  otherMinor: number | null;
}

type ProductLike = {
  kind: "fixed" | "open";
  currency: "NGN" | "USD";
  denominations?: Denomination[];
  minMinor?: number;
  maxMinor?: number;
  costBps?: number;
  markup?: Markup | null;
};

/** Prices a product's options, or its smallest and largest amount when it is open. */
export function priceProduct(
  product: ProductLike,
  category: { markup?: Markup | null } | null | undefined,
  settings: PricingSettings,
): { options: PricedOption[]; source: "product" | "category" | "default" } {
  const { markup, source } = effectiveMarkup(product, category, settings);
  const other = (n: number) =>
    convertMinor(n, product.currency, settings.fxNgnPerUsd);
  const make = (label: string, valueMinor: number, costMinor: number) => {
    const p = computePrice(costMinor, markup, settings.minMarginBps);
    return {
      label,
      valueMinor,
      costMinor,
      priceMinor: p.priceMinor,
      marginMinor: p.marginMinor,
      floored: p.floored,
      otherMinor: other(p.priceMinor),
    };
  };
  if (product.kind === "fixed")
    return {
      source,
      options: (product.denominations ?? []).map((d) =>
        make(d.label, d.valueMinor, d.costMinor),
      ),
    };
  const bps = product.costBps ?? 10_000;
  const cost = (face: number) => Math.max(1, Math.ceil((face * bps) / 10_000));
  const opts: PricedOption[] = [];
  if (product.minMinor)
    opts.push(
      make("Smallest amount", product.minMinor, cost(product.minMinor)),
    );
  if (product.maxMinor && product.maxMinor !== product.minMinor)
    opts.push(make("Largest amount", product.maxMinor, cost(product.maxMinor)));
  return { source, options: opts };
}

export interface ProductQuery {
  q?: string;
  category?: string;
  status?: string;
  provider?: string;
  page?: number;
}
export const CATALOGUE_PAGE_SIZE = 25;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listProducts(p: ProductQuery) {
  await connectDb();
  const filter: Record<string, unknown> = {};
  if (p.status) filter.status = p.status;
  if (p.provider) filter.providerKey = p.provider;
  if (p.category) {
    const c = await ServiceCategory.findOne({ slug: p.category })
      .select("_id")
      .lean();
    filter.categoryId = c?._id ?? null;
  }
  if (p.q) {
    const rx = new RegExp(esc(p.q), "i");
    filter.$or = [{ name: rx }, { providerCode: rx }, { providerKey: rx }];
  }
  const page = Math.max(1, p.page ?? 1);
  const [rows, total] = await Promise.all([
    Product.find(filter)
      .sort({ categoryId: 1, sort: 1, name: 1 })
      .skip((page - 1) * CATALOGUE_PAGE_SIZE)
      .limit(CATALOGUE_PAGE_SIZE)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return {
    rows: JSON.parse(JSON.stringify(rows)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE)),
    pageSize: CATALOGUE_PAGE_SIZE,
  };
}

/**
 * What the storefront may show: active categories and active products whose provider is enabled.
 * Prices are computed here on the server, from cost, never read from the browser.
 */
export async function getStorefrontCatalogue() {
  await connectDb();
  const [settings, categories, providers] = await Promise.all([
    getPricingSettings(),
    ServiceCategory.find({ active: true }).sort({ sort: 1 }).lean(),
    Provider.find({ active: true }).select("key").lean(),
  ]);
  const keys = providers.map((p) => p.key as string);
  const products = await Product.find({
    status: "active",
    providerKey: { $in: keys },
    categoryId: { $in: categories.map((c) => c._id) },
  })
    .sort({ sort: 1, name: 1 })
    .lean();
  return JSON.parse(
    JSON.stringify(
      categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        icon: c.icon,
        products: products
          .filter((p) => String(p.categoryId) === String(c._id))
          .map((p) => ({
            id: String(p._id),
            name: p.name,
            logo: p.logo,
            kind: p.kind,
            currency: p.currency,
            minMinor: p.minMinor,
            maxMinor: p.maxMinor,
            inputs: p.inputs?.length ? p.inputs : c.inputs,
            options: priceProduct(
              p as unknown as ProductLike,
              c as unknown as { markup?: Markup | null },
              settings,
            ).options.map((o) => ({
              label: o.label,
              valueMinor: o.valueMinor,
              priceMinor: o.priceMinor,
              otherMinor: o.otherMinor,
            })),
          })),
      })),
    ),
  );
}
