"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { withIdempotency } from "@/lib/auth/idempotency";
import { rateLimit } from "@/lib/auth/rate-limit";
import { currentTokenHash } from "@/lib/auth/session";
import { checkAddress } from "@/lib/coins";
import { COUNTRY_NAMES } from "@/lib/countries";
import { connectDb } from "@/lib/db";
import { Notification, PushSubscription, User } from "@/lib/models";
import { formatUsd } from "@/lib/money";
import {
  changePassword,
  confirmMfaSetup,
  disableMfa,
  revokeOtherSessions,
  revokeSession,
  startMfaSetup,
} from "@/lib/services/auth";
import {
  cancelDeposit,
  createDeposit,
  quoteDeposit,
  submitDeposit,
} from "@/lib/services/deposits";
import { invest, setAutoCompound, topUp } from "@/lib/services/investments";
import { submitKyc } from "@/lib/services/kyc";
import { InsufficientFundsError } from "@/lib/services/ledger";
import {
  checkUsername,
  isUsernameTaken,
  validateUsernameFormat,
} from "@/lib/services/username";
import { requestWithdrawal } from "@/lib/services/withdrawals";
import {
  cloudinaryConfigured,
  createUploadTicket,
  ownsDocument,
  type StoredDoc,
  verifyDocument,
} from "@/lib/storage/cloudinary";
import {
  type ActionState,
  firstError,
  passwordSchema,
  usd,
} from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

function fail(e: unknown): ActionState {
  if (e instanceof InsufficientFundsError)
    return { ok: false, error: e.message };
  if (e instanceof Error && !/Mongo|mongoose|ECONN/i.test(e.name + e.message)) {
    return { ok: false, error: e.message };
  }
  console.error(e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/* ---------- Deposits (checkout, like a payment platform) ---------- */
export async function quoteAction(
  symbol: string,
  amountUsd: number,
): Promise<{
  ok: boolean;
  rate?: number;
  cryptoAmount?: number;
  error?: string;
}> {
  const user = await requireUser();
  if (!(await rateLimit(`quote:${user.id}`, 60, 60)))
    return { ok: false, error: "Slow down for a moment." };
  if (!(amountUsd > 0)) return { ok: false, error: "Enter an amount." };
  const q = await quoteDeposit(symbol, Math.round(amountUsd * 100));
  return q
    ? { ok: true, rate: q.rate, cryptoAmount: q.cryptoAmount }
    : { ok: false, error: "No live rate for this asset right now." };
}

export async function createDepositAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      asset: z.string().min(1, "Choose an asset."),
      network: z.string().min(1, "Choose a network."),
      amountCents: usd(),
    })
    .safeParse({
      asset: str(f, "asset"),
      network: str(f, "network"),
      amountCents: str(f, "amount"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!(await rateLimit(`deposit-create:${user.id}`, 10, 3600)))
    return {
      ok: false,
      error:
        "You have created several payments recently. Please wait a little.",
    };
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      const d = await createDeposit(user.id, parsed.data);
      return { ok: true, message: "Payment created.", id: String(d._id) };
    } catch (e) {
      return fail(e);
    }
  });
  revalidatePath("/dashboard/deposit");
  return r as ActionState;
}

export async function submitDepositAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = str(f, "id");
  const txRef = z.string().trim().max(200).safeParse(str(f, "txRef"));
  if (!txRef.success)
    return { ok: false, error: "That transaction ID is too long." };
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      await submitDeposit(user.id, id, txRef.data);
      return {
        ok: true,
        message:
          "Thanks. Your payment was submitted and our team is verifying it.",
      };
    } catch (e) {
      return fail(e);
    }
  });
  revalidatePath(`/dashboard/deposit/${id}`);
  revalidatePath("/dashboard", "layout");
  return r;
}

export async function cancelDepositAction(f: FormData): Promise<ActionState> {
  const user = await requireUser();
  try {
    await cancelDeposit(user.id, str(f, "id"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/deposit");
  return { ok: true, message: "Payment cancelled." };
}

export async function investAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ plan: z.string().min(1, "Choose a plan."), amountCents: usd() })
    .safeParse({ plan: str(f, "plan"), amountCents: str(f, "amount") });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      const inv = await invest(
        user.id,
        parsed.data.plan,
        parsed.data.amountCents,
        { autoCompound: f.get("autoCompound") === "on" },
      );
      return {
        ok: true,
        id: String(inv._id),
        message: "Investment started. You can follow it under Investments.",
      };
    } catch (e) {
      return fail(e);
    }
  });
  revalidatePath("/dashboard", "layout");
  return r;
}

export async function withdrawAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      asset: z.string().min(1, "Choose an asset."),
      network: z.string().min(1, "Choose a network."),
      address: z.string().trim().min(10, "Enter your wallet address.").max(200),
      amountCents: usd(),
    })
    .safeParse({
      asset: str(f, "asset"),
      network: str(f, "network"),
      address: str(f, "address"),
      amountCents: str(f, "amount"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const badAddress = checkAddress(parsed.data.network, parsed.data.address);
  if (badAddress) return { ok: false, error: badAddress };
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      const w = await requestWithdrawal(user.id, parsed.data);
      return {
        ok: true,
        id: String(w._id),
        message:
          "Withdrawal requested. The amount is on hold until it is reviewed and paid.",
      };
    } catch (e) {
      return fail(e);
    }
  });
  revalidatePath("/dashboard", "layout");
  return r;
}

export async function kycAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      fullName: z
        .string()
        .trim()
        .min(2, "Enter your full legal name.")
        .max(120),
      dateOfBirth: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth."),
      country: z
        .string()
        .trim()
        .refine(
          (v) => COUNTRY_NAMES.has(v),
          "Choose your country from the list.",
        ),
      address: z.string().trim().min(5, "Enter your address.").max(300),
      idType: z.string().min(1, "Choose an ID type."),
      idNumber: z.string().trim().min(4, "Enter your ID number.").max(60),
    })
    .safeParse(
      Object.fromEntries(
        [
          "fullName",
          "dateOfBirth",
          "country",
          "address",
          "idType",
          "idNumber",
        ].map((k) => [k, str(f, k)]),
      ),
    );
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  try {
    // Document images were uploaded straight to private storage. Check each one is really this user's.
    const docs: Partial<Record<"front" | "back" | "selfie", StoredDoc>> = {};
    if (cloudinaryConfigured()) {
      const ids = {
        front: str(f, "docFront"),
        back: str(f, "docBack"),
        selfie: str(f, "docSelfie"),
      };
      const needBack = parsed.data.idType !== "passport";
      if (!ids.front)
        return { ok: false, error: "Upload the front of your ID." };
      if (needBack && !ids.back)
        return { ok: false, error: "Upload the back of your ID." };
      if (!ids.selfie)
        return { ok: false, error: "Upload a selfie holding your ID." };
      for (const [kind, id] of Object.entries(ids) as [
        "front" | "back" | "selfie",
        string,
      ][]) {
        if (!id || (kind === "back" && !needBack)) continue;
        if (!ownsDocument(user.id, id))
          return {
            ok: false,
            error: "A document upload is not valid. Please upload it again.",
          };
        docs[kind] = await verifyDocument(id);
      }
    }
    await submitKyc(user.id, parsed.data, docs);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Submitted. Our team will review your details." };
}

export async function changePasswordAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const next = passwordSchema.safeParse(str(f, "next"));
  if (!next.success) return { ok: false, error: firstError(next.error) };
  if (next.data !== str(f, "confirm"))
    return { ok: false, error: "Passwords do not match." };
  try {
    await changePassword(
      user.id,
      str(f, "current"),
      next.data,
      await currentTokenHash(),
    );
  } catch (e) {
    return fail(e);
  }
  return {
    ok: true,
    message: "Password updated. Other devices were signed out.",
  };
}

export async function startMfaAction() {
  const user = await requireUser();
  return startMfaSetup(user.id, user.email);
}

export async function confirmMfaAction(
  _: ActionState & { codes?: string[] },
  f: FormData,
) {
  const user = await requireUser();
  try {
    const codes = await confirmMfaSetup(user.id, str(f, "code"));
    revalidatePath("/dashboard/settings");
    return {
      ok: true,
      message: "Two-step login is on. Save your recovery codes now.",
      codes,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function disableMfaAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await disableMfa(user.id, str(f, "password"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Two-step login is off." };
}

export async function revokeSessionAction(f: FormData) {
  const user = await requireUser();
  await revokeSession(user.id, str(f, "id"));
  revalidatePath("/dashboard/settings");
}

export async function revokeOthersAction() {
  const user = await requireUser();
  await revokeOtherSessions(user.id, await currentTokenHash());
  revalidatePath("/dashboard/settings");
}

export async function markNotificationsReadAction() {
  const user = await requireUser();
  await connectDb();
  await Notification.updateMany(
    { userId: user.id, readAt: { $exists: false } },
    { readAt: new Date() },
  );
  revalidatePath("/dashboard", "layout");
}

/** "Maybe later" on the two-step login nudge. Each skip waits longer before asking again. */
export async function snoozeMfaPromptAction() {
  const user = await requireUser();
  await connectDb();
  const u = await User.findById(user.id).select("mfaPrompt");
  const skips = u?.mfaPrompt?.skips ?? 0;
  const days = [1, 3, 7, 14, 30][Math.min(skips, 4)];
  await User.updateOne(
    { _id: user.id },
    {
      "mfaPrompt.snoozedUntil": new Date(Date.now() + days * 86_400_000),
      "mfaPrompt.skips": skips + 1,
    },
  );
}

/* ---------- Username ---------- */
export type UsernameCheckResult = {
  state: "available" | "taken" | "invalid" | "same";
  message: string;
};

/** Live availability check for the username field. */
export async function checkUsernameAction(
  value: string,
): Promise<UsernameCheckResult> {
  const user = await requireUser();
  if (!(await rateLimit(`uname-check:${user.id}`, 60, 60))) {
    return {
      state: "invalid",
      message: "Slow down for a moment and try again.",
    };
  }
  const f = validateUsernameFormat(value);
  if (!f.ok) return { state: "invalid", message: f.reason };
  if (f.username === user.username)
    return { state: "same", message: "This is your current username." };
  if (await isUsernameTaken(f.username, user.id))
    return { state: "taken", message: "That username is already taken." };
  return { state: "available", message: "Username is available." };
}

export async function saveUsernameAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!(await rateLimit(`uname-save:${user.id}`, 10, 3600))) {
    return { ok: false, error: "Too many changes. Try again later." };
  }
  const check = await checkUsername(str(f, "username"), user.id);
  if (!check.ok) return { ok: false, error: check.reason };
  try {
    await connectDb();
    await User.updateOne(
      { _id: user.id },
      { username: check.username, usernameChosen: true },
    );
  } catch (e) {
    if (e instanceof Error && /E11000|duplicate key/i.test(e.message)) {
      return { ok: false, error: "That username was just taken. Try another." };
    }
    return fail(e);
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: `Username set to @${check.username}. You can log in with it.`,
  };
}

/** "Keep this one" on the first-run prompt. */
export async function keepUsernameAction() {
  const user = await requireUser();
  await connectDb();
  await User.updateOne({ _id: user.id }, { usernameChosen: true });
  revalidatePath("/dashboard", "layout");
}

/* ---------- Top-up and automatic reinvestment ---------- */
export async function topUpAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ id: z.string().min(1), amountCents: usd() })
    .safeParse({ id: str(f, "id"), amountCents: str(f, "amount") });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      const res = await topUp(user.id, parsed.data.id, parsed.data.amountCents);
      return {
        ok: true,
        message: `Added to your plan. ${res.remaining} days left, projected profit on this amount ${formatUsd(res.totalProfitCents)}.`,
      };
    } catch (e) {
      return fail(e);
    }
  });
  revalidatePath("/dashboard", "layout");
  return r;
}

export async function toggleAutoCompoundAction(
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const on = str(f, "on") === "true";
  try {
    await setAutoCompound(user.id, str(f, "id"), on);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: on
      ? "This investment will reinvest automatically when it matures."
      : "Automatic reinvestment is off. The payout will go to your balance.",
  };
}

/* ---------- Web push ---------- */
export async function savePushSubscriptionAction(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({
      endpoint: z.string().url().max(1000),
      keys: z.object({
        p256dh: z.string().min(10).max(200),
        auth: z.string().min(10).max(100),
      }),
    })
    .safeParse(sub);
  if (!parsed.success)
    return { ok: false, error: "This device could not be registered." };
  await connectDb();
  const ua = (await headers()).get("user-agent")?.slice(0, 200);
  await PushSubscription.updateOne(
    { endpoint: parsed.data.endpoint },
    {
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: ua,
    },
    { upsert: true },
  );
  return { ok: true, message: "Notifications are on for this device." };
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<ActionState> {
  const user = await requireUser();
  await connectDb();
  await PushSubscription.deleteOne({ endpoint, userId: user.id });
  return { ok: true, message: "Notifications are off for this device." };
}

/** A one-time ticket so the browser can upload one ID image straight to private storage. */
export async function kycUploadTicketAction(kind: string) {
  const user = await requireUser();
  if (!cloudinaryConfigured())
    return {
      ok: false as const,
      error: "Document upload is not available right now.",
    };
  if (!["front", "back", "selfie"].includes(kind))
    return { ok: false as const, error: "Unknown document." };
  if (!(await rateLimit(`kyc-ticket:${user.id}`, 30, 3600)))
    return {
      ok: false as const,
      error: "Too many uploads. Please wait a little.",
    };
  return { ok: true as const, ticket: createUploadTicket(user.id, kind) };
}
