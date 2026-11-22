import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

import { brand } from "@/content/site";

import { rateLimit } from "../auth/rate-limit";
import { decrypt, encrypt, randomToken, sha256 } from "../crypto";
import { connectDb } from "../db";
import { sendEmail } from "../email/brevo";
import { absUrl, emails } from "../email/templates";
import { EmailToken, Session, User } from "../models";
import { generateUsername } from "./username";

const HOUR = 3_600_000;
const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEeO5V1n1xP5Q1k2d0m8s5S4Zr1p6yQK7bK";

export const hashPassword = (p: string) => bcrypt.hash(p, 12);

async function issueToken(userId: string, type: "verify" | "reset") {
  const token = randomToken(32);
  await EmailToken.deleteMany({ userId, type });
  await EmailToken.create({
    userId,
    type,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + (type === "verify" ? 24 * HOUR : HOUR)),
  });
  return token;
}

export async function sendVerification(userId: string) {
  const u = await User.findById(userId);
  if (!u || u.emailVerifiedAt) return;
  const token = await issueToken(userId, "verify");
  const mail = emails.verify(
    u.name,
    absUrl(`/verify-email/confirm?token=${token}`),
  );
  await sendEmail({ to: u.email, ...mail, kind: "verify", sensitive: true });
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}) {
  await connectDb();
  const exists = await User.findOne({ email: input.email });
  if (exists) {
    // Do not reveal whether the email is registered; resend if still unverified.
    if (!exists.emailVerifiedAt) await sendVerification(String(exists._id));
    return;
  }
  const u = await User.create({
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    username: await generateUsername(input.email),
    usernameChosen: false,
  });
  await sendVerification(String(u._id));
}

export async function confirmEmail(token: string) {
  await connectDb();
  const t = await EmailToken.findOneAndDelete({
    tokenHash: sha256(token),
    type: "verify",
    expiresAt: { $gt: new Date() },
  });
  if (!t) return false;
  await User.updateOne({ _id: t.userId }, { emailVerifiedAt: new Date() });
  const u = await User.findById(t.userId).select("email name username");
  if (u)
    await sendEmail({
      to: u.email,
      ...emails.welcome(u.name, u.username ?? ""),
    });
  return true;
}

export async function resendVerification(email: string) {
  await connectDb();
  if (!(await rateLimit(`resend:${email}`, 3, 900))) return;
  const u = await User.findOne({ email });
  if (u && !u.emailVerifiedAt) await sendVerification(String(u._id));
}

export type LoginResult =
  | {
      status: "ok" | "mfa";
      userId: string;
      role: "investor" | "staff" | "admin";
    }
  | { status: "invalid" | "unverified" | "suspended" | "rate" };

export async function checkCredentials(
  identifier: string,
  password: string,
  ip: string,
): Promise<LoginResult> {
  await connectDb();
  if (
    !(await rateLimit(`login:${identifier.trim().toLowerCase()}`, 8, 900)) ||
    !(await rateLimit(`loginip:${ip}`, 30, 900))
  ) {
    return { status: "rate" };
  }
  const id = identifier.trim().toLowerCase().replace(/^@/, "");
  const u = await User.findOne(
    id.includes("@") ? { email: id } : { username: id },
  );
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok) return { status: "invalid" };
  if (u.status !== "active") return { status: "suspended" };
  if (!u.emailVerifiedAt) {
    await sendVerificationThrottled(String(u._id), u.email);
    return { status: "unverified" };
  }
  u.lastLoginAt = new Date();
  await u.save();
  return {
    status: u.mfa?.enabled ? "mfa" : "ok",
    userId: String(u._id),
    role: u.role,
  };
}

async function sendVerificationThrottled(userId: string, email: string) {
  if (await rateLimit(`resend:${email}`, 3, 900))
    await sendVerification(userId);
}

async function totpValid(secret: string, token: string) {
  const r = await verify({ secret, token });
  return typeof r === "boolean" ? r : Boolean((r as { valid?: boolean }).valid);
}

/** Accepts a 6-digit TOTP code or a one-time recovery code. */
export async function checkMfaCode(userId: string, raw: string) {
  await connectDb();
  if (!(await rateLimit(`mfa:${userId}`, 8, 900))) return false;
  const u = await User.findById(userId);
  if (!u?.mfa?.enabled || !u.mfa.secretEnc) return false;
  const code = raw.replace(/\s|-/g, "");
  if (/^\d{6}$/.test(code)) return totpValid(decrypt(u.mfa.secretEnc), code);
  const hash = sha256(code.toLowerCase());
  const res = await User.updateOne(
    { _id: userId, "mfa.recoveryHashes": hash },
    { $pull: { "mfa.recoveryHashes": hash } },
  );
  return res.modifiedCount === 1;
}

export async function requestReset(email: string) {
  await connectDb();
  if (!(await rateLimit(`reset:${email}`, 3, 3600))) return;
  const u = await User.findOne({ email });
  if (!u || u.status !== "active") return;
  const token = await issueToken(String(u._id), "reset");
  await sendEmail({
    to: u.email,
    kind: "reset",
    sensitive: true,
    ...emails.reset(u.name, absUrl(`/reset-password?token=${token}`)),
  });
}

export async function resetPassword(token: string, password: string) {
  await connectDb();
  const t = await EmailToken.findOneAndDelete({
    tokenHash: sha256(token),
    type: "reset",
    expiresAt: { $gt: new Date() },
  });
  if (!t) return false;
  await User.updateOne(
    { _id: t.userId },
    { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() },
  );
  await Session.deleteMany({ userId: t.userId });
  const u = await User.findById(t.userId).select("email name");
  if (u) await sendEmail({ to: u.email, ...emails.passwordChanged(u.name) });
  return true;
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
  keepTokenHash: string | null,
) {
  await connectDb();
  const u = await User.findById(userId);
  if (!u || !(await bcrypt.compare(current, u.passwordHash)))
    throw new Error("Current password is incorrect.");
  u.passwordHash = await hashPassword(next);
  await u.save();
  await Session.deleteMany({
    userId,
    ...(keepTokenHash ? { tokenHash: { $ne: keepTokenHash } } : {}),
  });
  await sendEmail({ to: u.email, ...emails.passwordChanged(u.name) });
}

/* ---------- MFA setup ---------- */
export async function startMfaSetup(userId: string, email: string) {
  await connectDb();
  const secret = generateSecret();
  await User.updateOne(
    { _id: userId },
    { "mfa.pendingSecretEnc": encrypt(secret) },
  );
  const uri = generateURI({ issuer: brand.name, label: email, secret });
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 192 }) };
}

function newRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const c = randomToken(5)
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .padEnd(10, "x")
      .slice(0, 10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

export async function confirmMfaSetup(userId: string, code: string) {
  await connectDb();
  const u = await User.findById(userId);
  if (!u?.mfa?.pendingSecretEnc) throw new Error("Start setup again.");
  if (
    !(await totpValid(decrypt(u.mfa.pendingSecretEnc), code.replace(/\s/g, "")))
  ) {
    throw new Error(
      "That code is not correct. Try the latest code from your app.",
    );
  }
  const codes = newRecoveryCodes();
  u.mfa.enabled = true;
  u.mfa.secretEnc = u.mfa.pendingSecretEnc;
  u.mfa.pendingSecretEnc = undefined;
  u.mfa.recoveryHashes = codes.map((c: string) => sha256(c.replace("-", "")));
  await u.save();
  await sendEmail({ to: u.email, ...emails.mfaEnabled() });
  return codes;
}

export async function disableMfa(userId: string, password: string) {
  await connectDb();
  const u = await User.findById(userId);
  if (!u || !(await bcrypt.compare(password, u.passwordHash)))
    throw new Error("Password is incorrect.");
  u.mfa = { enabled: false, recoveryHashes: [] };
  await u.save();
  await sendEmail({ to: u.email, ...emails.mfaDisabled() });
}

/* ---------- Sessions ---------- */
export async function listSessions(userId: string) {
  await connectDb();
  return Session.find({
    userId,
    mfaVerified: true,
    expiresAt: { $gt: new Date() },
  })
    .sort({ lastUsedAt: -1 })
    .lean();
}

export async function revokeSession(userId: string, sessionId: string) {
  await connectDb();
  await Session.deleteOne({ _id: sessionId, userId });
}

export async function revokeOtherSessions(
  userId: string,
  keepTokenHash: string | null,
) {
  await connectDb();
  await Session.deleteMany({
    userId,
    ...(keepTokenHash ? { tokenHash: { $ne: keepTokenHash } } : {}),
  });
}
