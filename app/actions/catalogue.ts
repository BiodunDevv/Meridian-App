"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { FloatTopUp, Product, Provider, ServiceCategory } from "@/lib/models";
import { checkProvider } from "@/lib/providers";
import {
  parseDenominationLines,
  parseInputLines,
  priceProduct,
} from "@/lib/services/catalogue";
import { applySync } from "@/lib/services/catalogue-sync";
import { audit } from "@/lib/services/notify";
import {
  getPricingSettings,
  type Markup,
  percentToBps,
  savePricingSettings,
} from "@/lib/services/pricing";
import {
  getShopSettings,
  saveShopSettings,
} from "@/lib/services/shop-settings";
import { type ActionState, firstError } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const CAT = "/admin/catalogue";

async function run(fn: () => Promise<string | void>, ...paths: string[]) {
  try {
    const message = await fn();
    for (const p of paths) revalidatePath(p);
    // The storefront reads the catalogue, so keep public pages fresh too.
    revalidatePath("/");
    return { ok: true, message: message || "Done." } as ActionState;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong.",
    } as ActionState;
  }
}

/* ---------- Markup helpers ---------- */
const percentField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
    message: "Markup percent must be between 0 and 100.",
  });
const fixedField = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine(
    (v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 10_000_000),
    {
      message: "Fixed markup must be zero or more.",
    },
  );

/** Reads the optional markup override: empty means "inherit". Never negative. */
function readMarkup(f: FormData): Markup | undefined {
  const type = str(f, "markupType");
  if (!type || type === "inherit") return undefined;
  if (type === "percent") {
    const pct = percentField.parse(str(f, "markupValue"));
    if (pct === null)
      throw new Error("Enter the markup percent, or choose Inherit.");
    return { type: "percent", value: percentToBps(pct) };
  }
  const fixed = fixedField.parse(str(f, "markupValue"));
  if (fixed === null)
    throw new Error("Enter the fixed markup, or choose Inherit.");
  return { type: "fixed", value: Math.round(fixed * 100) };
}

/* ---------- Pricing settings ---------- */
export async function savePricingAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      defaultPct: z.coerce
        .number({ error: "Default markup must be a number." })
        .min(0)
        .max(100),
      minPct: z.coerce
        .number({ error: "Minimum margin must be a number." })
        .min(0)
        .max(100),
      fx: z
        .string()
        .trim()
        .transform((v) => (v === "" ? null : Number(v)))
        .refine(
          (v) => v === null || (Number.isFinite(v) && v > 0 && v < 1_000_000),
          {
            message: "The exchange rate must be a number greater than zero.",
          },
        ),
    })
    .safeParse({
      defaultPct: str(f, "defaultPct"),
      minPct: str(f, "minPct"),
      fx: str(f, "fx"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { defaultPct, minPct, fx } = parsed.data;
  if (defaultPct < minPct)
    return {
      ok: false,
      error: "The default markup cannot be lower than the minimum margin.",
    };
  return run(
    async () => {
      const before = await getPricingSettings();
      const next = {
        defaultMarkupBps: percentToBps(defaultPct),
        minMarginBps: percentToBps(minPct),
        fxNgnPerUsd: fx,
      };
      await savePricingSettings(next);
      await audit(admin, "pricing.settings", "pricing", {
        before,
        after: next,
      });
      return "Pricing saved. Customer prices update straight away.";
    },
    "/admin/pricing",
    CAT,
  );
}

/** Per-category markup override, or clear it. */
export async function saveCategoryMarkupAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  return run(
    async () => {
      const markup = readMarkup(f);
      await connectDb();
      const cat = await ServiceCategory.findById(str(f, "id"));
      if (!cat) throw new Error("Category not found.");
      const before = cat.markup ?? null;
      if (markup) cat.markup = markup as never;
      else cat.set("markup", undefined);
      await cat.save();
      await audit(admin, "pricing.category_markup", cat.slug as string, {
        before,
        after: markup ?? null,
      });
      return markup
        ? `Markup for ${cat.name} saved.`
        : `${cat.name} now uses the default markup.`;
    },
    "/admin/pricing",
    CAT,
  );
}

/**
 * Bulk update: set the same markup override on every product in a category (or all), or clear overrides.
 * Prices can never fall below the minimum margin, because the floor is applied when a price is computed.
 */
export async function bulkMarkupAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  return run(
    async () => {
      const scope = str(f, "scope");
      const mode = str(f, "mode");
      await connectDb();
      const filter: Record<string, unknown> = {};
      if (scope && scope !== "all") {
        const c = await ServiceCategory.findOne({ slug: scope })
          .select("_id")
          .lean();
        if (!c) throw new Error("Category not found.");
        filter.categoryId = c._id;
      }
      let res;
      if (mode === "clear") {
        res = await Product.updateMany(filter, { $unset: { markup: 1 } });
      } else {
        const pct = percentField.parse(str(f, "pct"));
        if (pct === null) throw new Error("Enter the markup percent.");
        res = await Product.updateMany(filter, {
          $set: { markup: { type: "percent", value: percentToBps(pct) } },
        });
      }
      await audit(admin, "pricing.bulk", scope || "all", {
        mode,
        pct: str(f, "pct"),
        matched: res.matchedCount,
      });
      return `${res.modifiedCount} product${res.modifiedCount === 1 ? "" : "s"} updated.`;
    },
    "/admin/pricing",
    CAT,
  );
}

/* ---------- Categories ---------- */
const slugOk = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9-]{1,30}$/,
    "Slug: 2 to 31 lowercase letters, numbers or dashes.",
  );

export async function saveCategoryAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Give the category a name.").max(60),
      slug: slugOk,
      icon: z.string().trim().max(40).default("Package"),
    })
    .safeParse({
      name: str(f, "name"),
      slug: str(f, "slug"),
      icon: str(f, "icon") || "Package",
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    const inputs = parseInputLines(String(f.get("inputs") ?? ""));
    await connectDb();
    const id = str(f, "id");
    if (id) {
      const cat = await ServiceCategory.findByIdAndUpdate(id, {
        ...parsed.data,
        inputs,
      });
      if (!cat) throw new Error("Category not found.");
      await audit(admin, "category.update", parsed.data.slug, parsed.data);
      return `${parsed.data.name} updated.`;
    }
    if (await ServiceCategory.exists({ slug: parsed.data.slug }))
      throw new Error("A category with that slug already exists.");
    const sort = await ServiceCategory.countDocuments();
    await ServiceCategory.create({ ...parsed.data, inputs, sort });
    await audit(admin, "category.create", parsed.data.slug, parsed.data);
    return `${parsed.data.name} created.`;
  }, CAT);
}

export async function toggleCategoryAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    const cat = await ServiceCategory.findById(str(f, "id"));
    if (!cat) throw new Error("Category not found.");
    cat.active = !cat.active;
    await cat.save();
    await audit(
      admin,
      cat.active ? "category.show" : "category.hide",
      cat.slug as string,
    );
    return cat.active
      ? `${cat.name} is visible.`
      : `${cat.name} is hidden from the storefront.`;
  }, CAT);
}

export async function moveCategoryAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    const dir = str(f, "dir") === "up" ? -1 : 1;
    const all = await ServiceCategory.find().sort({ sort: 1, createdAt: 1 });
    const i = all.findIndex((c) => String(c._id) === str(f, "id"));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= all.length) return "Already at the edge.";
    [all[i], all[j]] = [all[j], all[i]];
    await Promise.all(
      all.map((c, idx) =>
        ServiceCategory.updateOne({ _id: c._id }, { sort: idx }),
      ),
    );
    await audit(admin, "category.reorder", all[j].slug as string);
    return "Order updated.";
  }, CAT);
}

/* ---------- Products ---------- */
const moneyMajor = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .min(0, `${label} cannot be negative.`)
    .max(100_000_000)
    .transform((n) => Math.round(n * 100));

export async function saveProductAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Give the product a name.").max(80),
      categoryId: z.string().min(1, "Choose a category."),
      providerKey: z.string().trim().toLowerCase().min(2, "Choose a provider."),
      providerCode: z
        .string()
        .trim()
        .min(1, "Enter the provider product code.")
        .max(80),
      kind: z.enum(["fixed", "open"]),
      currency: z.enum(["NGN", "USD"]),
      logo: z.string().trim().max(300).optional(),
      notes: z.string().trim().max(500).default(""),
      min: moneyMajor("Minimum"),
      max: moneyMajor("Maximum"),
      costPct: z.coerce
        .number({ error: "Cost percent must be a number." })
        .min(0.01)
        .max(100),
    })
    .safeParse({
      name: str(f, "name"),
      categoryId: str(f, "categoryId"),
      providerKey: str(f, "providerKey"),
      providerCode: str(f, "providerCode"),
      kind: str(f, "kind"),
      currency: str(f, "currency") || "NGN",
      logo: str(f, "logo") || undefined,
      notes: str(f, "notes"),
      min: str(f, "min") || "0",
      max: str(f, "max") || "0",
      costPct: str(f, "costPct") || "100",
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;
  return run(
    async () => {
      const inputs = parseInputLines(String(f.get("inputs") ?? ""));
      const denominations = parseDenominationLines(
        String(f.get("denominations") ?? ""),
      );
      if (d.kind === "fixed" && denominations.length === 0)
        throw new Error(
          "Add at least one denomination (label | value | cost).",
        );
      if (d.kind === "open") {
        if (d.min <= 0 || d.max < d.min)
          throw new Error(
            "Set a minimum above zero and a maximum at or above it.",
          );
      }
      const markup = readMarkup(f);
      await connectDb();
      if (!(await ServiceCategory.exists({ _id: d.categoryId })))
        throw new Error("Category not found.");
      const doc = {
        name: d.name,
        categoryId: d.categoryId,
        providerKey: d.providerKey,
        providerCode: d.providerCode,
        kind: d.kind,
        currency: d.currency,
        logo: d.logo,
        notes: d.notes,
        minMinor: d.kind === "open" ? d.min : 0,
        maxMinor: d.kind === "open" ? d.max : 0,
        costBps: Math.round(d.costPct * 100),
        denominations: d.kind === "fixed" ? denominations : [],
        inputs,
      };
      // Reject a price that would not cover the provider cost plus the minimum margin.
      const settings = await getPricingSettings();
      const check = priceProduct({ ...doc, markup }, null, settings);
      if (check.options.length === 0)
        throw new Error("The product has nothing to price.");
      for (const o of check.options)
        if (o.priceMinor < o.costMinor)
          throw new Error("A price cannot be below cost.");
      const id = str(f, "id");
      try {
        if (id) {
          const p = await Product.findById(id);
          if (!p) throw new Error("Product not found.");
          p.set(doc);
          if (markup) p.set("markup", markup);
          else p.set("markup", undefined);
          await p.save();
          await audit(admin, "product.update", String(p._id), {
            name: d.name,
            providerCode: d.providerCode,
          });
          return `${d.name} updated.`;
        }
        const sort = await Product.countDocuments({ categoryId: d.categoryId });
        await Product.create({ ...doc, ...(markup ? { markup } : {}), sort });
        await audit(admin, "product.create", d.providerCode, { name: d.name });
        return `${d.name} created.`;
      } catch (e) {
        if (e instanceof Error && /E11000|duplicate key/i.test(e.message))
          throw new Error(
            "That provider already has a product with this code.",
          );
        throw e;
      }
    },
    CAT,
    "/admin/pricing",
  );
}

export async function setProductStatusAction(f: FormData) {
  const admin = await requireAdmin();
  const status = z
    .enum(["active", "hidden", "out_of_stock"])
    .safeParse(str(f, "status"));
  if (!status.success)
    return { ok: false, error: "Unknown status." } as ActionState;
  return run(async () => {
    await connectDb();
    const p = await Product.findByIdAndUpdate(str(f, "id"), {
      status: status.data,
    });
    if (!p) throw new Error("Product not found.");
    await audit(admin, "product.status", String(p._id), {
      from: p.status,
      to: status.data,
    });
    return `${p.name} is now ${status.data.replace("_", " ")}.`;
  }, CAT);
}

export async function moveProductAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    const p = await Product.findById(str(f, "id"));
    if (!p) throw new Error("Product not found.");
    const dir = str(f, "dir") === "up" ? -1 : 1;
    const peers = await Product.find({ categoryId: p.categoryId }).sort({
      sort: 1,
      name: 1,
    });
    const i = peers.findIndex((x) => String(x._id) === String(p._id));
    const j = i + dir;
    if (j < 0 || j >= peers.length) return "Already at the edge.";
    [peers[i], peers[j]] = [peers[j], peers[i]];
    await Promise.all(
      peers.map((x, idx) => Product.updateOne({ _id: x._id }, { sort: idx })),
    );
    await audit(admin, "product.reorder", String(p._id));
    return "Order updated.";
  }, CAT);
}

export async function deleteProductAction(f: FormData) {
  const admin = await requireAdmin();
  return run(
    async () => {
      await connectDb();
      const p = await Product.findByIdAndDelete(str(f, "id"));
      if (!p) throw new Error("Product not found.");
      await audit(admin, "product.delete", String(p._id), { name: p.name });
      return `${p.name} deleted.`;
    },
    CAT,
    "/admin/pricing",
  );
}

/* ---------- Providers and float ---------- */
const KNOWN_PROVIDERS: Record<string, string> = {
  mock: "Mock provider (testing only)",
  vtpass: "VTpass",
};

export async function addProviderAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    const key = str(f, "key");
    if (!KNOWN_PROVIDERS[key]) throw new Error("Unknown provider.");
    await connectDb();
    if (await Provider.exists({ key }))
      throw new Error("That provider is already added.");
    const priority = await Provider.countDocuments();
    // New providers start in sandbox mode and disabled until an admin turns them on.
    await Provider.create({
      key,
      name: KNOWN_PROVIDERS[key],
      mode: "sandbox",
      active: false,
      priority,
    });
    await audit(admin, "provider.add", key);
    return `${KNOWN_PROVIDERS[key]} added in sandbox mode. Turn it on when it is ready.`;
  }, "/admin/providers");
}

export async function toggleProviderAction(f: FormData) {
  const admin = await requireAdmin();
  return run(
    async () => {
      await connectDb();
      const p = await Provider.findById(str(f, "id"));
      if (!p) throw new Error("Provider not found.");
      p.active = !p.active;
      await p.save();
      await audit(
        admin,
        p.active ? "provider.enable" : "provider.disable",
        p.key as string,
      );
      return p.active
        ? `${p.name} is on.`
        : `${p.name} is off. Its products are hidden from the storefront.`;
    },
    "/admin/providers",
    CAT,
  );
}

export async function saveProviderAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      id: z.string().min(1),
      mode: z.enum(["sandbox", "live"]),
      priority: z.coerce.number().int().min(0).max(99),
      low: moneyMajor("Low-balance threshold"),
    })
    .safeParse({
      id: str(f, "id"),
      mode: str(f, "mode"),
      priority: str(f, "priority") || "0",
      low: str(f, "low") || "0",
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;
  return run(async () => {
    await connectDb();
    const p = await Provider.findById(d.id);
    if (!p) throw new Error("Provider not found.");
    if (d.mode === "live" && p.mode !== "live" && f.get("confirmLive") !== "on")
      throw new Error(
        "Confirm that you want to switch to live mode. Real money will be spent.",
      );
    if (d.mode === "live" && p.key === "mock")
      throw new Error("The mock provider cannot go live.");
    const before = {
      mode: p.mode,
      priority: p.priority,
      low: p.lowBalanceMinor,
    };
    p.mode = d.mode;
    p.priority = d.priority;
    p.lowBalanceMinor = d.low;
    await p.save();
    await audit(admin, "provider.update", p.key as string, {
      before,
      after: d,
    });
    return `${p.name} saved.`;
  }, "/admin/providers");
}

export async function recordTopUpAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      key: z.string().min(1),
      amount: z.coerce
        .number({ error: "Amount must be a number." })
        .positive("Amount must be greater than zero.")
        .max(100_000_000),
      note: z.string().trim().max(200).default(""),
    })
    .safeParse({
      key: str(f, "key"),
      amount: str(f, "amount"),
      note: str(f, "note"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    await connectDb();
    if (!(await Provider.exists({ key: parsed.data.key })))
      throw new Error("Provider not found.");
    const amountMinor = Math.round(parsed.data.amount * 100);
    await FloatTopUp.create({
      providerKey: parsed.data.key,
      amountMinor,
      note: parsed.data.note,
      by: admin.email,
    });
    await audit(admin, "provider.topup", parsed.data.key, { amountMinor });
    return "Top-up recorded.";
  }, "/admin/providers");
}

/* ---------- Provider connection, balance and catalogue sync ---------- */
export async function testConnectionAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    const key = str(f, "key");
    const r = await checkProvider(key);
    await audit(admin, "provider.test", key, { ok: r.ok });
    if (!r.ok) throw new Error(r.message);
    return r.message;
  }, "/admin/providers");
}

export async function refreshBalanceAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    const key = str(f, "key");
    const r = await checkProvider(key);
    await audit(admin, "provider.balance", key, { ok: r.ok });
    if (!r.ok) throw new Error(r.message);
    return "Balance refreshed.";
  }, "/admin/providers");
}

export async function applySyncAction(f: FormData) {
  const admin = await requireAdmin();
  return run(
    async () => {
      const key = str(f, "key");
      await connectDb();
      const doc = await Provider.findOne({ key }).lean();
      if (!doc) throw new Error("Provider not found.");
      const pick = (p: string) =>
        f
          .getAll("pick")
          .map(String)
          .filter((v) => v.startsWith(`${p}:`))
          .map((v) => v.slice(p.length + 1));
      const r = await applySync(
        key,
        doc.mode as "sandbox" | "live",
        { add: pick("add"), change: pick("chg"), missing: pick("miss") },
        str(f, "country") || undefined,
      );
      await audit(admin, "catalogue.sync", key, r);
      return `Sync applied: ${r.added} added (hidden), ${r.changed} updated, ${r.flagged} marked out of stock.`;
    },
    CAT,
    "/admin/catalogue/sync",
  );
}

/* ---------- Shop settings ---------- */
export async function saveShopSettingsAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const usdCents = (label: string) =>
    z.coerce
      .number({ error: `${label} must be a number.` })
      .min(1, `${label} must be at least $1.`)
      .max(1_000_000)
      .transform((n) => Math.round(n * 100));
  const parsed = z
    .object({
      tier0: usdCents("The tier 0 limit"),
      tier1: usdCents("The tier 1 limit"),
      perDay: z.coerce.number().int().min(1).max(200),
      maxOpen: z.coerce.number().int().min(1).max(20),
      windowMin: z.coerce.number().int().min(10).max(120),
    })
    .safeParse({
      tier0: str(f, "tier0"),
      tier1: str(f, "tier1"),
      perDay: str(f, "perDay"),
      maxOpen: str(f, "maxOpen"),
      windowMin: str(f, "windowMin"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;
  if (d.tier1 < d.tier0)
    return {
      ok: false,
      error: "The tier 1 limit cannot be below the tier 0 limit.",
    };
  return run(
    async () => {
      const before = await getShopSettings();
      const next = {
        ordersOpen: f.get("ordersOpen") === "on",
        maintenance: f.get("maintenance") === "on",
        tier0DailyUsdCents: d.tier0,
        tier1DailyUsdCents: d.tier1,
        maxOrdersPerDay: d.perDay,
        maxOpenOrders: d.maxOpen,
        paymentWindowMin: d.windowMin,
      };
      await saveShopSettings(next);
      await audit(admin, "shop.settings", "shop", { before, after: next });
      return next.ordersOpen
        ? "Shop settings saved. Ordering is OPEN."
        : "Shop settings saved. Ordering is closed.";
    },
    "/admin/settings",
    "/airtime",
  );
}
