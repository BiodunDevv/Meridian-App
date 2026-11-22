import { connectDb } from "../db";
import { Product, ServiceCategory } from "../models";
import { createAdapter } from "../providers";
import type { CatalogueItem, Mode } from "../providers/types";

type Existing = {
  _id: unknown;
  name: string;
  providerCode: string;
  kind: string;
  currency: string;
  minMinor: number;
  maxMinor: number;
  denominations: { label: string; valueMinor: number; costMinor: number }[];
};

export interface SyncPreview {
  provider: string;
  mode: Mode;
  /** Items the provider sells that we do not have yet. They are created hidden. */
  added: CatalogueItem[];
  /** Items we have whose name, size or cost changed at the provider. */
  changed: { item: CatalogueItem; changes: string[] }[];
  /** Products we have that the provider no longer lists. */
  missing: { id: string; name: string; providerCode: string }[];
  /** Provider items we cannot import because their category does not exist here. */
  noCategory: string[];
}

const money = (n: number) => (n / 100).toFixed(2);

function diff(item: CatalogueItem, e: Existing): string[] {
  const out: string[] = [];
  if (item.name !== e.name) out.push(`name "${e.name}" to "${item.name}"`);
  if (item.kind === "open") {
    if (item.minMinor !== e.minMinor)
      out.push(`minimum ${money(e.minMinor)} to ${money(item.minMinor)}`);
    if (item.maxMinor !== e.maxMinor)
      out.push(`maximum ${money(e.maxMinor)} to ${money(item.maxMinor)}`);
  } else {
    const a = JSON.stringify(
      item.denominations.map((d) => [d.label, d.valueMinor, d.costMinor]),
    );
    const b = JSON.stringify(
      (e.denominations ?? []).map((d) => [d.label, d.valueMinor, d.costMinor]),
    );
    if (a !== b) {
      for (const d of item.denominations) {
        const old = e.denominations?.find((x) => x.label === d.label);
        if (!old) out.push(`new denomination ${d.label}`);
        else if (old.costMinor !== d.costMinor)
          out.push(
            `${d.label} cost ${money(old.costMinor)} to ${money(d.costMinor)}`,
          );
        else if (old.valueMinor !== d.valueMinor)
          out.push(
            `${d.label} value ${money(old.valueMinor)} to ${money(d.valueMinor)}`,
          );
      }
      for (const old of e.denominations ?? [])
        if (!item.denominations.some((d) => d.label === old.label))
          out.push(`denomination ${old.label} removed`);
    }
  }
  return out;
}

async function fetchItems(key: string, mode: Mode, country?: string) {
  const adapter = createAdapter(key, mode);
  if (!adapter) throw new Error("Unknown provider.");
  if (!adapter.isConfigured())
    throw new Error(
      `${key} keys for ${mode} mode are missing from the server environment.`,
    );
  return adapter.catalogue({ country });
}

/** Compares the provider's catalogue with ours. Changes nothing. */
export async function previewSync(
  key: string,
  mode: Mode,
  country?: string,
): Promise<SyncPreview> {
  await connectDb();
  const items = await fetchItems(key, mode, country);
  const [existing, cats] = await Promise.all([
    Product.find({ providerKey: key }).lean() as unknown as Promise<Existing[]>,
    ServiceCategory.find().select("slug").lean(),
  ]);
  const slugs = new Set(cats.map((c) => String(c.slug)));
  const byCode = new Map(existing.map((e) => [e.providerCode, e]));
  const seen = new Set<string>();
  const out: SyncPreview = {
    provider: key,
    mode,
    added: [],
    changed: [],
    missing: [],
    noCategory: [],
  };
  for (const it of items) {
    seen.add(it.providerCode);
    const e = byCode.get(it.providerCode);
    if (!e) {
      if (!slugs.has(it.categorySlug)) out.noCategory.push(it.name);
      else out.added.push(it);
    } else {
      const changes = diff(it, e);
      if (changes.length) out.changed.push({ item: it, changes });
    }
  }
  // Only flag as missing when the provider returned something, so an empty or failed reply never hides everything.
  if (items.length)
    for (const e of existing)
      if (!seen.has(e.providerCode))
        out.missing.push({
          id: String(e._id),
          name: e.name,
          providerCode: e.providerCode,
        });
  return out;
}

/**
 * Applies the admin's choices. The provider is asked again here, so the browser can only choose among
 * real differences and cannot invent a product or a cost. New products are created hidden. Changed products
 * keep their markup, status and order; only name, size and cost are updated.
 */
export async function applySync(
  key: string,
  mode: Mode,
  picks: { add: string[]; change: string[]; missing: string[] },
  country?: string,
) {
  const preview = await previewSync(key, mode, country);
  await connectDb();
  let added = 0;
  let changed = 0;
  let flagged = 0;
  for (const it of preview.added) {
    if (!picks.add.includes(it.providerCode)) continue;
    const cat = await ServiceCategory.findOne({ slug: it.categorySlug })
      .select("_id")
      .lean();
    if (!cat) continue;
    const sort = await Product.countDocuments({ categoryId: cat._id });
    const r = await Product.updateOne(
      { providerKey: key, providerCode: it.providerCode },
      {
        $setOnInsert: {
          categoryId: cat._id,
          providerKey: key,
          providerCode: it.providerCode,
          name: it.name,
          logo: it.logo,
          kind: it.kind,
          currency: it.currency,
          denominations: it.denominations,
          minMinor: it.minMinor,
          maxMinor: it.maxMinor,
          costBps: it.costBps,
          status: "hidden",
          sort,
          notes: it.notes ?? "",
        },
      },
      { upsert: true },
    );
    if (r.upsertedCount) added++;
  }
  for (const { item } of preview.changed) {
    if (!picks.change.includes(item.providerCode)) continue;
    const set: Record<string, unknown> = { name: item.name };
    if (item.kind === "open")
      Object.assign(set, { minMinor: item.minMinor, maxMinor: item.maxMinor });
    else set.denominations = item.denominations;
    const r = await Product.updateOne(
      { providerKey: key, providerCode: item.providerCode },
      { $set: set },
    );
    if (r.modifiedCount) changed++;
  }
  for (const m of preview.missing) {
    if (!picks.missing.includes(m.providerCode)) continue;
    const r = await Product.updateOne(
      { providerKey: key, providerCode: m.providerCode },
      { $set: { status: "out_of_stock" } },
    );
    if (r.modifiedCount) flagged++;
  }
  return { added, changed, flagged };
}
