import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { randomToken, sha256 } from "../crypto";
import { connectDb } from "../db";
import { Session, User } from "../models";
import { ensureUsername } from "../services/username";

const COOKIE = "apx_session";
/** Non-sensitive flag so the public pages can show a signed-in header without a flash. Confirmed by /api/me. */
const HINT = "apx_hint";
const DAY = 86_400_000;
const SESSION_MS = 30 * DAY;
const PENDING_MS = 10 * 60_000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  username: string;
  /** False until the user confirms or changes the auto-assigned username. */
  usernameChosen: boolean;
  role: "investor" | "staff" | "admin";
  status: "active" | "suspended";
  emailVerified: boolean;
  mfaEnabled: boolean;
  /** Emails to this address bounced or were marked as spam. */
  emailBlocked: boolean;
  /** True when the "turn on two-step login" nudge should be shown. */
  mfaPromptDue: boolean;
  balanceCents: number;
  sessionId: string;
}

export async function createSession(
  userId: string,
  opts: { mfaVerified: boolean },
) {
  await connectDb();
  const h = await headers();
  const token = randomToken(32);
  const ttl = opts.mfaVerified ? SESSION_MS : PENDING_MS;
  await Session.create({
    userId,
    tokenHash: sha256(token),
    mfaVerified: opts.mfaVerified,
    userAgent: h.get("user-agent")?.slice(0, 200),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
    expiresAt: new Date(Date.now() + ttl),
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
  if (opts.mfaVerified) await setHint(ttl);
}

async function setHint(ttlMs: number) {
  (await cookies()).set(HINT, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

async function load(allowPending: boolean): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  await connectDb();
  const s = await Session.findOne({
    tokenHash: sha256(token),
    expiresAt: { $gt: new Date() },
  });
  if (!s) return null;
  if (!s.mfaVerified && !allowPending) return null;
  const u = await User.findById(s.userId);
  if (!u) return null;
  if (Date.now() - s.lastUsedAt.getTime() > 5 * 60_000) {
    s.lastUsedAt = new Date();
    await s.save();
  }
  const username =
    u.username || (await ensureUsername(String(u._id), u.email)) || "";
  return {
    id: String(u._id),
    email: u.email,
    name: u.name || "",
    username,
    // No username yet (rare race) counts as chosen, so the prompt waits for the next request.
    usernameChosen: u.username ? Boolean(u.usernameChosen) : true,
    role: u.role,
    status: u.status,
    emailVerified: Boolean(u.emailVerifiedAt),
    mfaEnabled: Boolean(u.mfa?.enabled),
    emailBlocked: Boolean(u.emailSuppressed?.reason),
    mfaPromptDue:
      !u.mfa?.enabled &&
      (!u.mfaPrompt?.snoozedUntil ||
        u.mfaPrompt.snoozedUntil.getTime() <= Date.now()),
    balanceCents: u.balanceCents,
    sessionId: String(s._id),
  };
}

/** Current fully signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(() => load(false));
/** Includes sessions that still owe an MFA code (used only by the MFA step). */
export const getPendingUser = cache(() => load(true));

export async function markMfaVerified(sessionId: string) {
  await connectDb();
  await Session.updateOne(
    { _id: sessionId },
    { mfaVerified: true, expiresAt: new Date(Date.now() + SESSION_MS) },
  );
  (await cookies()).set(COOKIE, (await cookies()).get(COOKIE)!.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  });
  await setHint(SESSION_MS);
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await connectDb();
    await Session.deleteOne({ tokenHash: sha256(token) });
  }
  jar.delete(COOKIE);
  jar.delete(HINT);
}

export async function currentTokenHash() {
  const t = (await cookies()).get(COOKIE)?.value;
  return t ? sha256(t) : null;
}

export const SESSION_COOKIE = COOKIE;
