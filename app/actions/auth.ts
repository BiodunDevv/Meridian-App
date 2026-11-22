"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { allowIp } from "@/lib/auth/client-ip";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  createSession,
  destroyCurrentSession,
  getPendingUser,
  markMfaVerified,
} from "@/lib/auth/session";
import { DbNotConfiguredError } from "@/lib/db";
import { log } from "@/lib/log";
import {
  checkCredentials,
  checkMfaCode,
  registerUser,
  requestReset,
  resendVerification,
  resetPassword,
} from "@/lib/services/auth";
import {
  type ActionState,
  emailSchema,
  firstError,
  passwordSchema,
} from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

function fail(e: unknown): ActionState {
  if (e instanceof DbNotConfiguredError) {
    return {
      ok: false,
      error: "The service is not available yet. Please try again later.",
    };
  }
  log.error("[auth] action failed", e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function registerAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      name: z.string().trim().max(80),
      email: emailSchema,
      password: passwordSchema,
    })
    .safeParse({
      name: str(f, "name"),
      email: str(f, "email"),
      password: str(f, "password"),
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  // Sign-up is open to anyone, so it is limited by address and by email.
  if (
    !(await allowIp("register", 8, 3600)) ||
    !(await rateLimit(`register:${parsed.data.email}`, 3, 3600))
  )
    return {
      ok: false,
      error: "Too many sign-up attempts. Please wait a little and try again.",
    };
  try {
    await registerUser(parsed.data);
  } catch (e) {
    return fail(e);
  }
  redirect(
    `/verify-email?sent=1&email=${encodeURIComponent(parsed.data.email)}`,
  );
}

/** Where to land after signing in: admins go to /admin, everyone else to the dashboard. */
function homeFor(role: "investor" | "staff" | "admin") {
  return role === "admin" || role === "staff" ? "/admin" : "/dashboard";
}

export async function loginAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const parsed = z
    .object({
      identifier: z.string().trim().min(1).max(254),
      password: z.string().min(1).max(128),
    })
    .safeParse({
      identifier: str(f, "identifier"),
      password: str(f, "password"),
    });
  if (!parsed.success)
    return { ok: false, error: "Enter your email or username and password." };
  let dest = "/dashboard";
  try {
    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const r = await checkCredentials(
      parsed.data.identifier,
      parsed.data.password,
      ip,
    );
    if (r.status === "rate")
      return {
        ok: false,
        error: "Too many attempts. Try again in a few minutes.",
      };
    if (r.status === "invalid")
      return { ok: false, error: "Email or password is incorrect." };
    if (r.status === "suspended")
      return {
        ok: false,
        error: "This account is suspended. Contact support.",
      };
    if (r.status === "unverified") {
      dest = parsed.data.identifier.includes("@")
        ? `/verify-email?sent=1&email=${encodeURIComponent(parsed.data.identifier)}`
        : "/verify-email?sent=1";
    } else if (r.status === "ok" || r.status === "mfa") {
      await createSession(r.userId, { mfaVerified: r.status === "ok" });
      dest = r.status === "mfa" ? "/login/mfa" : homeFor(r.role);
    }
  } catch (e) {
    return fail(e);
  }
  redirect(dest);
}

export async function mfaAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const code = str(f, "code");
  if (!code.trim()) return { ok: false, error: "Enter your code." };
  let dest = "/dashboard";
  try {
    const u = await getPendingUser();
    if (!u) redirect("/login");
    if (!(await checkMfaCode(u.id, code)))
      return { ok: false, error: "That code is not valid." };
    await markMfaVerified(u.sessionId);
    dest = homeFor(u.role);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    return fail(e);
  }
  redirect(dest);
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function forgotAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(str(f, "email"));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  try {
    await requestReset(parsed.data);
  } catch (e) {
    return fail(e);
  }
  return {
    ok: true,
    message: "If that email has an account, a reset link is on its way.",
  };
}

export async function resetAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const pw = passwordSchema.safeParse(str(f, "password"));
  if (!pw.success) return { ok: false, error: firstError(pw.error) };
  if (pw.data !== str(f, "confirm"))
    return { ok: false, error: "Passwords do not match." };
  // Token guessing is hopeless, but the endpoint is public, so it is limited by address anyway.
  if (!(await allowIp("reset", 20, 900)))
    return {
      ok: false,
      error: "Too many attempts. Please wait a little and try again.",
    };
  try {
    if (!(await resetPassword(str(f, "token"), pw.data))) {
      return { ok: false, error: "This reset link is invalid or has expired." };
    }
  } catch (e) {
    return fail(e);
  }
  redirect("/login?reset=1");
}

export async function resendAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(str(f, "email"));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  try {
    await resendVerification(parsed.data);
  } catch (e) {
    return fail(e);
  }
  return {
    ok: true,
    message: "If that account needs confirming, a new email is on its way.",
  };
}

export async function confirmEmailAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  if (!(await allowIp("confirm", 30, 900)))
    return {
      ok: false,
      error: "Too many attempts. Please wait a little and try again.",
    };
  try {
    const { confirmEmail } = await import("@/lib/services/auth");
    if (!(await confirmEmail(str(f, "token")))) {
      return {
        ok: false,
        error:
          "This confirmation link is invalid or has expired. Request a new one.",
      };
    }
  } catch (e) {
    return fail(e);
  }
  redirect("/login?verified=1");
}
