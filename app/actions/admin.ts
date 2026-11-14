"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/guards";
import { checkAddress, nativeNetwork, POPULAR_ASSETS } from "@/lib/coins";
import { totalPctFromDaily } from "@/lib/compound";
import { connectDb } from "@/lib/db";
import { retryDueEmails, retryEmailNow, sendEmail } from "@/lib/email/brevo";
import { emails } from "@/lib/email/templates";
import {
  Asset,
  Deposit,
  Investment,
  Plan,
  Session,
  Setting,
  User,
  UserNote,
  Withdrawal,
} from "@/lib/models";
import {
  checkConnection,
  paymentsConfigured,
  providerCode,
} from "@/lib/payments/nowpayments";
import { clearActivityCache } from "@/lib/services/activity";
import { approveDeposit, rejectDeposit } from "@/lib/services/deposits";
import { reviewKyc } from "@/lib/services/kyc";
import { audit } from "@/lib/services/notify";
import { savePaymentSettings } from "@/lib/services/payments";
import { syncDefaultPlans } from "@/lib/services/plans-seed";
import {
  markWithdrawalPaid,
  rejectWithdrawal,
} from "@/lib/services/withdrawals";
import { type ActionState, firstError, usd } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function run(
  fn: () => Promise<string | void>,
  path: string,
): Promise<ActionState> {
  try {
    const message = await fn();
    revalidatePath(path);
    return { ok: true, message: message || "Done." };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong.",
    };
  }
}

/* ---------- Review queues ---------- */
export async function approveDepositAction(f: FormData) {
  const admin = await requireAdmin();
  if (f.get("confirm") !== "on") {
    return {
      ok: false,
      error: "Confirm that you have seen the funds arrive.",
    } as ActionState;
  }
  const creditRaw = str(f, "credit");
  const credit = creditRaw ? Math.round(Number(creditRaw) * 100) : undefined;
  if (
    creditRaw &&
    (!Number.isFinite(Number(creditRaw)) || Number(creditRaw) <= 0)
  ) {
    return {
      ok: false,
      error: "Enter a valid amount to credit.",
    } as ActionState;
  }
  return run(async () => {
    await approveDeposit(admin, str(f, "id"), credit);
    revalidatePath(`/admin/deposits/${str(f, "id")}`);
    return "Deposit approved and credited.";
  }, "/admin/deposits");
}
export async function rejectDepositAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    const preset = str(f, "preset");
    const note = str(f, "reason");
    const reason = [preset, note].filter(Boolean).join(": ");
    await rejectDeposit(admin, str(f, "id"), reason);
    revalidatePath(`/admin/deposits/${str(f, "id")}`);
    return "Deposit rejected.";
  }, "/admin/deposits");
}
export async function payWithdrawalAction(f: FormData) {
  const admin = await requireAdmin();
  const txHash = str(f, "txHash");
  if (txHash.length < 6)
    return {
      ok: false,
      error: "Enter the transaction hash of the payout.",
    } as ActionState;
  if (f.get("confirm") !== "on")
    return {
      ok: false,
      error: "Confirm that you have sent the payout.",
    } as ActionState;
  return run(async () => {
    await markWithdrawalPaid(admin, str(f, "id"), txHash);
    revalidatePath(`/admin/withdrawals/${str(f, "id")}`);
    return "Withdrawal marked as paid.";
  }, "/admin/withdrawals");
}
export async function rejectWithdrawalAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    const reason = [str(f, "preset"), str(f, "reason")]
      .filter(Boolean)
      .join(": ");
    await rejectWithdrawal(admin, str(f, "id"), reason);
    revalidatePath(`/admin/withdrawals/${str(f, "id")}`);
    return "Withdrawal rejected and refunded.";
  }, "/admin/withdrawals");
}
export async function reviewKycAction(f: FormData) {
  const admin = await requireAdmin();
  const approve = str(f, "decision") === "approve";
  return run(async () => {
    await reviewKyc(admin, str(f, "id"), approve, str(f, "reason"));
    return approve ? "Identity approved." : "Identity rejected.";
  }, "/admin/users");
}

export async function setUserStatusAction(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id");
  const status = str(f, "status") === "suspended" ? "suspended" : "active";
  if (id === admin.id)
    return {
      ok: false,
      error: "You cannot change your own account.",
    } as ActionState;
  return run(async () => {
    await connectDb();
    await User.updateOne({ _id: id }, { status });
    if (status === "suspended") await Session.deleteMany({ userId: id });
    await audit(admin, `user.${status}`, id);
    const target = await User.findById(id).select("email");
    if (target)
      await sendEmail({
        to: target.email,
        ...emails.accountStatus(status === "suspended"),
      });
    return status === "suspended"
      ? "User suspended and signed out."
      : "User reactivated.";
  }, "/admin/users");
}

/* ---------- Plans ---------- */
const PLANS_PATH = "/admin/plans";

/** Plans feed the public landing page, so refresh it as soon as they change. */
const afterPlans = (r: ActionState) => {
  if (r.ok) revalidatePath("/");
  return r;
};

const planSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Give the plan a name.")
      .max(40, "Keep the name under 40 characters."),
    tagline: z
      .string()
      .trim()
      .max(120, "Keep the tagline under 120 characters."),
    minCents: usd("Minimum"),
    maxCents: usd("Maximum"),
    durationDays: z.coerce
      .number({ error: "Duration must be a number." })
      .int("Duration must be whole days.")
      .min(1, "Duration must be at least 1 day.")
      .max(3650, "Duration is too long."),
    dailyPct: z.coerce
      .number({ error: "Daily return must be a number." })
      .min(0, "Daily return cannot be negative.")
      .max(5, "Daily return is too high. Keep it at 5% or less."),
  })
  .refine((d) => d.maxCents >= d.minCents, {
    message: "Maximum must be at least the minimum.",
    path: ["maxCents"],
  })
  // The daily rate is the source of truth; the total over the term follows from compounding.
  .transform((d) => ({
    ...d,
    projectedPct:
      Math.round(totalPctFromDaily(d.dailyPct, d.durationDays) * 100) / 100,
  }));

function parsePlan(f: FormData) {
  return planSchema.safeParse({
    name: str(f, "name"),
    tagline: str(f, "tagline"),
    minCents: str(f, "min"),
    maxCents: str(f, "max"),
    durationDays: str(f, "durationDays"),
    dailyPct: str(f, "dailyPct"),
    badge: str(f, "badge"),
  });
}

const slugify = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30) || "plan";

async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await Plan.exists({ slug }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createPlanAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parsePlan(f);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    await connectDb();
    const slug = await uniqueSlug(parsed.data.name);
    const sort = await Plan.countDocuments();
    await Plan.create({
      ...parsed.data,
      slug,
      sort,
      active: f.get("active") === "on",
    });
    await audit(admin, "plan.create", slug, parsed.data);
    return `Plan “${parsed.data.name}” created.`;
  }, PLANS_PATH).then(afterPlans);
}

export async function updatePlanAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parsePlan(f);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  return run(async () => {
    await connectDb();
    const plan = await Plan.findByIdAndUpdate(str(f, "id"), {
      ...parsed.data,
      active: f.get("active") === "on",
    });
    if (!plan) throw new Error("Plan not found.");
    await audit(admin, "plan.update", plan.slug, parsed.data);
    return `Plan “${parsed.data.name}” updated. Existing investments keep their original terms.`;
  }, PLANS_PATH).then(afterPlans);
}

export async function togglePlanAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    const plan = await Plan.findById(str(f, "id"));
    if (!plan) throw new Error("Plan not found.");
    plan.active = !plan.active;
    await plan.save();
    await audit(
      admin,
      plan.active ? "plan.activate" : "plan.deactivate",
      plan.slug,
    );
    return plan.active
      ? `${plan.name} is open to new investments.`
      : `${plan.name} is closed to new investments.`;
  }, PLANS_PATH).then(afterPlans);
}

export async function movePlanAction(f: FormData) {
  const admin = await requireAdmin();
  const dir = str(f, "dir") === "up" ? -1 : 1;
  return run(async () => {
    await connectDb();
    const plans = await Plan.find().sort({ sort: 1, createdAt: 1 });
    const i = plans.findIndex(
      (p: { _id: unknown }) => String(p._id) === str(f, "id"),
    );
    const j = i + dir;
    if (i < 0 || j < 0 || j >= plans.length) return "Already at the edge.";
    [plans[i], plans[j]] = [plans[j], plans[i]];
    await Promise.all(
      plans.map((p: { _id: unknown }, idx: number) =>
        Plan.updateOne({ _id: p._id }, { sort: idx }),
      ),
    );
    await audit(admin, "plan.reorder", plans[j].slug);
    return "Order updated.";
  }, PLANS_PATH).then(afterPlans);
}

export async function deletePlanAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    const plan = await Plan.findById(str(f, "id"));
    if (!plan) throw new Error("Plan not found.");
    const used = await Investment.countDocuments({ planId: plan._id });
    if (used)
      throw new Error(
        `${used} investment${used > 1 ? "s use" : " uses"} this plan, so it cannot be deleted. Close it to new investments instead.`,
      );
    await Plan.deleteOne({ _id: plan._id });
    await audit(admin, "plan.delete", plan.slug);
    return `Plan “${plan.name}” deleted.`;
  }, PLANS_PATH).then(afterPlans);
}

export async function syncDefaultPlansAction() {
  const admin = await requireAdmin();
  return run(async () => {
    const r = await syncDefaultPlans();
    await audit(admin, "plan.sync_defaults", String(r.created + r.updated), r);
    return `Default plans loaded: ${r.created} created, ${r.updated} updated${r.removed + r.closed ? `, ${r.removed + r.closed} old plans retired` : ""}.`;
  }, PLANS_PATH).then(afterPlans);
}

/* ---------- Payment methods (assets and networks) ---------- */
const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, "Ticker: 2 to 10 letters or numbers, e.g. USDT.");
const assetNameSchema = z
  .string()
  .trim()
  .min(2, "Enter the asset name.")
  .max(40);
const networkSchema = z
  .string()
  .trim()
  .min(2, "Enter the network name.")
  .max(40);
const addressSchema = z
  .string()
  .trim()
  .min(10, "That address looks too short.")
  .max(128, "That address looks too long.")
  .regex(
    /^[A-Za-z0-9:_\-.]+$/,
    "Addresses cannot contain spaces or special characters.",
  );
const memoSchema = z.string().trim().max(64, "Memo is too long.");

const PM_PATH = "/admin/payment-methods";

async function pendingUsing(symbol: string, network?: string) {
  const q = {
    asset: symbol,
    status: "pending",
    ...(network ? { network } : {}),
  };
  const [d, w] = await Promise.all([
    Deposit.countDocuments(q),
    Withdrawal.countDocuments(q),
  ]);
  return d + w;
}

export async function addAssetAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const network = str(f, "network");
  const address = str(f, "address");
  const parsed = z
    .object({
      symbol: symbolSchema,
      name: assetNameSchema,
      network: network ? networkSchema : z.string().optional(),
      address: address ? addressSchema : z.string().optional(),
      memo: memoSchema.optional(),
    })
    .safeParse({
      symbol: str(f, "symbol"),
      name: str(f, "name"),
      network,
      address,
      memo: str(f, "memo"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;
  // Native coins (Bitcoin, Solana...) have no network to choose: use the coin's own chain.
  const netName =
    data.network || (data.address ? nativeNetwork(data.symbol, data.name) : "");
  if (netName && data.address) {
    const bad = checkAddress(netName, data.address);
    if (bad) return { ok: false, error: bad };
  }
  return run(async () => {
    await connectDb();
    if (await Asset.exists({ symbol: data.symbol })) {
      throw new Error(
        `${data.symbol} already exists. Add a network to it instead.`,
      );
    }
    const count = await Asset.countDocuments();
    await Asset.create({
      symbol: data.symbol,
      name: data.name,
      sort: count,
      networks: netName
        ? [
            {
              name: netName,
              address: data.address ?? "",
              memo: data.memo ?? "",
              active: true,
            },
          ]
        : [],
    });
    await audit(admin, "asset.add", data.symbol, {
      name: data.name,
      network: data.network,
    });
    return data.address || !data.network
      ? `${data.symbol} added.`
      : `${data.symbol} added. Add a wallet address to make it available to users.`;
  }, PM_PATH);
}

/** Adds every popular asset that is missing, with its usual networks and no addresses (hidden from users until set). */
export async function addPopularAssetsAction() {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    const have = new Set(
      (await Asset.find().select("symbol").lean()).map(
        (a: { symbol: string }) => a.symbol,
      ),
    );
    let sort = have.size;
    const docs = POPULAR_ASSETS.filter((a) => !have.has(a.symbol)).map((a) => ({
      symbol: a.symbol,
      name: a.name,
      sort: sort++,
      networks: a.networks.map((n) => ({
        name: n,
        address: "",
        memo: "",
        active: true,
      })),
    }));
    if (!docs.length) return "All popular assets are already added.";
    await Asset.insertMany(docs);
    await audit(admin, "asset.add_popular", String(docs.length));
    return `${docs.length} assets added. Set wallet addresses to make them available.`;
  }, PM_PATH);
}

export async function updateAssetAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const name = assetNameSchema.safeParse(str(f, "name"));
  if (!name.success) return { ok: false, error: firstError(name.error) };
  const symbol = str(f, "symbol");
  return run(async () => {
    await connectDb();
    const res = await Asset.updateOne({ symbol }, { name: name.data });
    if (!res.matchedCount) throw new Error("Asset not found.");
    await audit(admin, "asset.rename", symbol, { name: name.data });
    return "Asset updated.";
  }, PM_PATH);
}

export async function toggleAssetAction(f: FormData) {
  const admin = await requireAdmin();
  const symbol = str(f, "symbol");
  return run(async () => {
    await connectDb();
    const a = await Asset.findOne({ symbol });
    if (!a) throw new Error("Asset not found.");
    a.active = !a.active;
    await a.save();
    await audit(admin, a.active ? "asset.show" : "asset.hide", symbol);
    return a.active
      ? `${symbol} is now visible to users.`
      : `${symbol} is hidden from users.`;
  }, PM_PATH);
}

export async function deleteAssetAction(f: FormData) {
  const admin = await requireAdmin();
  const symbol = str(f, "symbol");
  return run(async () => {
    await connectDb();
    const n = await pendingUsing(symbol);
    if (n)
      throw new Error(
        `${n} pending deposit or withdrawal request(s) use ${symbol}. Resolve them first, or hide it instead.`,
      );
    await Asset.deleteOne({ symbol });
    await audit(admin, "asset.delete", symbol);
    return `${symbol} deleted.`;
  }, PM_PATH);
}

/** Adds a network, or edits one when `original` is set. */
export async function saveNetworkAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      symbol: z.string().min(1),
      // Optional: blank means the coin's own (native) network.
      network: z.string().trim().max(40).optional(),
      address: addressSchema.or(z.literal("")),
      memo: memoSchema,
      providerCode: z
        .string()
        .trim()
        .toLowerCase()
        .max(40)
        .regex(/^[a-z0-9]*$/, "The provider code is letters and numbers only."),
    })
    .safeParse({
      symbol: str(f, "symbol"),
      network: str(f, "network"),
      address: str(f, "address"),
      memo: str(f, "memo"),
      providerCode: str(f, "providerCode"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const original = str(f, "original");
  const { symbol, address, memo } = parsed.data;
  return run(async () => {
    await connectDb();
    const a = await Asset.findOne({ symbol });
    if (!a) throw new Error("Asset not found.");
    const network = parsed.data.network || nativeNetwork(symbol, a.name);
    if (network.length < 2) throw new Error("Enter the network name.");
    // With online payments on, the provider supplies the address, so it can be left empty.
    const auto =
      paymentsConfigured() &&
      Boolean(providerCode(symbol, network, parsed.data.providerCode));
    if (!address && !auto)
      throw new Error(
        "Enter the wallet address. It can only be left empty when online payments are set up for this coin and network.",
      );
    const bad = address ? checkAddress(network, address) : null;
    if (bad) throw new Error(bad);
    const clash = a.networks.find(
      (n: { name: string }) =>
        n.name.toLowerCase() === network.toLowerCase() && n.name !== original,
    );
    if (clash)
      throw new Error(
        `${symbol} already has a network called “${clash.name}”.`,
      );
    if (original) {
      const n = a.networks.find((x: { name: string }) => x.name === original);
      if (!n) throw new Error("Network not found.");
      if (original !== network && (await pendingUsing(symbol, original))) {
        throw new Error(
          "There are pending requests on this network. Resolve them before renaming it.",
        );
      }
      n.name = network;
      n.address = address;
      n.memo = memo;
      n.providerCode = parsed.data.providerCode;
    } else {
      a.networks.push({
        name: network,
        address,
        memo,
        providerCode: parsed.data.providerCode,
        active: true,
      });
    }
    await a.save();
    await audit(
      admin,
      original ? "network.update" : "network.add",
      `${symbol}/${network}`,
      { address, memo },
    );
    return original ? "Network updated." : `${network} added to ${symbol}.`;
  }, PM_PATH);
}

export async function toggleNetworkAction(f: FormData) {
  const admin = await requireAdmin();
  const symbol = str(f, "symbol");
  const name = str(f, "network");
  return run(async () => {
    await connectDb();
    const a = await Asset.findOne({ symbol });
    const n = a?.networks.find((x: { name: string }) => x.name === name);
    if (!a || !n) throw new Error("Network not found.");
    n.active = !n.active;
    await a.save();
    await audit(
      admin,
      n.active ? "network.show" : "network.hide",
      `${symbol}/${name}`,
    );
    return n.active
      ? `${name} is now visible.`
      : `${name} is hidden from users.`;
  }, PM_PATH);
}

export async function deleteNetworkAction(f: FormData) {
  const admin = await requireAdmin();
  const symbol = str(f, "symbol");
  const name = str(f, "network");
  return run(async () => {
    await connectDb();
    const n = await pendingUsing(symbol, name);
    if (n)
      throw new Error(
        `${n} pending request(s) use this network. Resolve them first, or hide it instead.`,
      );
    await Asset.updateOne({ symbol }, { $pull: { networks: { name } } });
    await audit(admin, "network.delete", `${symbol}/${name}`);
    return `${name} removed.`;
  }, PM_PATH);
}

/* ---------- Email reliability ---------- */
export async function retryEmailAction(f: FormData) {
  await requireAdmin();
  const ok = await retryEmailNow(str(f, "id"));
  revalidatePath("/admin/email-log");
  return ok
    ? ({ ok: true, message: "Email sent." } as ActionState)
    : ({
        ok: false,
        error: "Retry failed. See the error in the log.",
      } as ActionState);
}

export async function retryDueEmailsAction() {
  await requireAdmin();
  const r = await retryDueEmails(50);
  revalidatePath("/admin/email-log");
  return {
    ok: true,
    message: r.due
      ? `Retried ${r.due}, ${r.sent} sent.`
      : "Nothing is due for retry.",
  } as ActionState;
}

export async function clearSuppressionAction(f: FormData) {
  const admin = await requireAdmin();
  return run(async () => {
    await connectDb();
    await User.updateOne(
      { _id: str(f, "id") },
      { $unset: { emailSuppressed: 1 } },
    );
    await audit(admin, "user.email_unsuppress", str(f, "id"));
    return "Email address re-enabled. Make sure it is valid before relying on it.";
  }, "/admin/users");
}

/* ---------- Admin notes on a user ---------- */
export async function addUserNoteAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const body = z
    .string()
    .trim()
    .min(2, "Write a note.")
    .max(2000, "Keep notes under 2,000 characters.")
    .safeParse(str(f, "body"));
  if (!body.success) return { ok: false, error: firstError(body.error) };
  const userId = str(f, "userId");
  await connectDb();
  await UserNote.create({
    userId,
    authorId: admin.id,
    authorEmail: admin.email,
    body: body.data,
  });
  await audit(admin, "user.note_add", userId);
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true, message: "Note saved." };
}

export async function deleteUserNoteAction(f: FormData) {
  const admin = await requireAdmin();
  await connectDb();
  const note = await UserNote.findByIdAndDelete(str(f, "id"));
  if (note) await audit(admin, "user.note_delete", String(note.userId));
  revalidatePath(`/admin/users/${str(f, "userId")}`);
  return { ok: true, message: "Note deleted." } as ActionState;
}

/* ---------- Referral programme ---------- */
export async function saveReferralSettingsAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      pct: z.coerce
        .number({ error: "Reward % must be a number." })
        .min(0, "Reward cannot be negative.")
        .max(25, "Keep the reward at 25% or less."),
      capUsd: z.coerce
        .number({ error: "Cap must be a number." })
        .min(1, "Cap must be at least $1.")
        .max(100000),
      minDepositUsd: z.coerce
        .number({ error: "Minimum deposit must be a number." })
        .min(1, "Minimum must be at least $1.")
        .max(1000000),
    })
    .safeParse({
      pct: str(f, "pct"),
      capUsd: str(f, "capUsd"),
      minDepositUsd: str(f, "minDepositUsd"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const value = { ...parsed.data, enabled: f.get("enabled") === "on" };
  return run(async () => {
    await connectDb();
    await Setting.updateOne(
      { key: "referral" },
      { key: "referral", value },
      { upsert: true },
    );
    await audit(admin, "settings.referral", "referral", value);
    return value.enabled
      ? "Referral programme saved."
      : "Referral programme paused.";
  }, "/admin/settings");
}

/* ---------- Activity ticker ---------- */
export async function saveActivityTickerAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const enabled = f.get("enabled") === "on";
  return run(async () => {
    await connectDb();
    await Setting.updateOne(
      { key: "activity_ticker" },
      { key: "activity_ticker", value: { enabled } },
      { upsert: true },
    );
    clearActivityCache();
    await audit(admin, "settings.activity_ticker", String(enabled));
    return enabled ? "Activity ticker is on." : "Activity ticker is off.";
  }, "/admin/settings");
}

/* ---------- Online payments ---------- */
export async function savePaymentSettingsAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      maxUsd: z.coerce
        .number({ error: "Enter a number." })
        .min(1)
        .max(1_000_000),
      dailyUsd: z.coerce
        .number({ error: "Enter a number." })
        .min(1)
        .max(10_000_000),
      newAddressMaxUsd: z.coerce
        .number({ error: "Enter a number." })
        .min(1)
        .max(1_000_000),
    })
    .safeParse({
      maxUsd: str(f, "maxUsd"),
      dailyUsd: str(f, "dailyUsd"),
      newAddressMaxUsd: str(f, "newAddressMaxUsd"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (parsed.data.dailyUsd < parsed.data.maxUsd)
    return {
      ok: false,
      error: "The daily limit cannot be lower than the per-withdrawal limit.",
    };
  const value = {
    ...parsed.data,
    autoWithdraw: f.get("autoWithdraw") === "on",
  };
  return run(async () => {
    await savePaymentSettings(value);
    await audit(admin, "settings.payments", "payments", value);
    return value.autoWithdraw
      ? "Payment settings saved. Automatic withdrawals are on."
      : "Payment settings saved. Automatic withdrawals are off.";
  }, "/admin/settings");
}

export async function testPaymentsAction(): Promise<ActionState> {
  await requireAdmin();
  try {
    if (!paymentsConfigured())
      return {
        ok: false,
        error:
          "Online payments are not set up. Add NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET to your environment.",
      };
    return { ok: true, message: (await checkConnection()).join(". ") + "." };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "The connection test failed.",
    };
  }
}
