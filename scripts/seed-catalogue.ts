/**
 * Loads sample categories and products that use the MOCK provider only. Safe to run again:
 * existing rows are left exactly as they are, so admin edits are never overwritten.
 * Costs below are made-up sample numbers for development, not real provider prices.
 *
 *   npm run seed:catalogue
 */
import mongoose from "mongoose";

import { connectDb } from "@/lib/db";
import { Product, Provider, ServiceCategory } from "@/lib/models";
import { parseInputLines } from "@/lib/services/catalogue";

const PHONE = "phone | Phone number | phone | yes | ^0[789][01]\\d{8}$";

const categories = [
  { slug: "airtime", name: "Airtime", icon: "Smartphone", inputs: PHONE },
  { slug: "data", name: "Data bundles", icon: "Wifi", inputs: PHONE },
  {
    slug: "electricity",
    name: "Electricity",
    icon: "Zap",
    inputs: [
      "meter | Meter number | number | yes | ^\\d{8,13}$",
      "meterType | Meter type | select | yes | prepaid,postpaid",
      PHONE,
    ].join("\n"),
  },
  {
    slug: "tv",
    name: "Cable TV",
    icon: "Tv",
    inputs: [
      "smartcard | Smartcard number | number | yes | ^\\d{8,12}$",
      PHONE,
    ].join("\n"),
  },
];

type Seed = {
  cat: string;
  code: string;
  name: string;
  kind: "fixed" | "open";
  currency: "NGN" | "USD";
  /** Naira or dollars, not minor units. */
  min?: number;
  max?: number;
  costPct?: number;
  denominations?: [string, number, number][];
};

const products: Seed[] = [
  {
    cat: "airtime",
    code: "mock-mtn-airtime",
    name: "Sample network airtime A",
    kind: "open",
    currency: "NGN",
    min: 100,
    max: 50000,
    costPct: 98,
  },
  {
    cat: "airtime",
    code: "mock-airtel-airtime",
    name: "Sample network airtime B",
    kind: "open",
    currency: "NGN",
    min: 100,
    max: 50000,
    costPct: 98,
  },
  {
    cat: "data",
    code: "mock-data-1gb",
    name: "Sample data bundle",
    kind: "fixed",
    currency: "NGN",
    denominations: [
      ["1GB, 30 days", 500, 480],
      ["3GB, 30 days", 1500, 1440],
    ],
  },
  {
    cat: "electricity",
    code: "mock-disco",
    name: "Sample electricity DISCO",
    kind: "open",
    currency: "NGN",
    min: 1000,
    max: 100000,
    costPct: 100,
  },
  {
    cat: "tv",
    code: "mock-tv-basic",
    name: "Sample cable TV",
    kind: "fixed",
    currency: "NGN",
    denominations: [
      ["Basic", 2000, 1950],
      ["Standard", 5000, 4900],
    ],
  },
];

async function main() {
  await connectDb();

  const prov = await Provider.updateOne(
    { key: "mock" },
    {
      $setOnInsert: {
        key: "mock",
        name: "Mock provider (testing only)",
        mode: "sandbox",
        active: true,
        priority: 0,
      },
    },
    { upsert: true },
  );
  console.log(
    prov.upsertedCount
      ? "Mock provider added."
      : "Mock provider already there.",
  );

  const ids = new Map<string, unknown>();
  let catNew = 0;
  for (const [i, c] of categories.entries()) {
    const inputs = parseInputLines(c.inputs);
    const r = await ServiceCategory.findOneAndUpdate(
      { slug: c.slug },
      {
        $setOnInsert: {
          slug: c.slug,
          name: c.name,
          icon: c.icon,
          sort: i,
          active: true,
          inputs,
        },
      },
      { upsert: true, new: true, includeResultMetadata: true },
    );
    if (!r.lastErrorObject?.updatedExisting) catNew++;
    ids.set(c.slug, r.value?._id);
  }

  let prodNew = 0;
  for (const [i, p] of products.entries()) {
    const minor = (n: number) => Math.round(n * 100);
    const r = await Product.updateOne(
      { providerKey: "mock", providerCode: p.code },
      {
        $setOnInsert: {
          categoryId: ids.get(p.cat),
          providerKey: "mock",
          providerCode: p.code,
          name: p.name,
          kind: p.kind,
          currency: p.currency,
          minMinor: p.min ? minor(p.min) : 0,
          maxMinor: p.max ? minor(p.max) : 0,
          costBps: Math.round((p.costPct ?? 100) * 100),
          denominations: (p.denominations ?? []).map(
            ([label, value, cost]) => ({
              label,
              valueMinor: minor(value),
              costMinor: minor(cost),
            }),
          ),
          status: "active",
          sort: i,
          notes: "Sample product for development. Uses the mock provider.",
        },
      },
      { upsert: true },
    );
    if (r.upsertedCount) prodNew++;
  }
  console.log(
    `Categories added: ${catNew} of ${categories.length}. Products added: ${prodNew} of ${products.length}.`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
