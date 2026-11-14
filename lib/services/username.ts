import { connectDb } from "../db";
import { User } from "../models";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

const RESERVED = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "meridian",
  "apexvest",
  "system",
  "staff",
  "moderator",
  "official",
  "security",
  "billing",
  "team",
  "api",
  "login",
  "logout",
  "register",
  "signup",
  "dashboard",
  "settings",
  "null",
  "undefined",
  "me",
  "you",
  "user",
  "users",
  "wallet",
  "bank",
]);

export const normalizeUsername = (v: string) =>
  v.trim().replace(/^@/, "").toLowerCase();

export type UsernameCheck =
  { ok: true; username: string } | { ok: false; reason: string };

/** Format rules only (no database). */
export function validateUsernameFormat(raw: string): UsernameCheck {
  const username = normalizeUsername(raw);
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return {
      ok: false,
      reason: `Use ${USERNAME_MIN} to ${USERNAME_MAX} characters.`,
    };
  }
  if (!/^[a-z][a-z0-9_]*$/.test(username)) {
    return {
      ok: false,
      reason: "Start with a letter. Use only letters, numbers and underscores.",
    };
  }
  if (RESERVED.has(username))
    return { ok: false, reason: "That username is not available." };
  return { ok: true, username };
}

export async function isUsernameTaken(username: string, exceptUserId?: string) {
  await connectDb();
  const hit = await User.findOne({ username }).select("_id").lean();
  return Boolean(hit) && String(hit?._id) !== exceptUserId;
}

/** Format + availability. */
export async function checkUsername(
  raw: string,
  exceptUserId?: string,
): Promise<UsernameCheck> {
  const f = validateUsernameFormat(raw);
  if (!f.ok) return f;
  if (await isUsernameTaken(f.username, exceptUserId)) {
    return { ok: false, reason: "That username is already taken." };
  }
  return f;
}

/** Builds a valid base name from an email's local part, e.g. "John.Doe+x@mail.com" -> "john_doe". */
function baseFromEmail(email: string) {
  let base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(base)) base = `user_${base}`;
  base = base.slice(0, USERNAME_MAX - 5);
  if (base.length < USERNAME_MIN)
    base = `${base}user`.slice(0, USERNAME_MAX - 5);
  return base.replace(/_+$/, "") || "user";
}

/** A free username derived from the email, adding digits when needed. */
export async function generateUsername(email: string) {
  await connectDb();
  const base = baseFromEmail(email);
  for (let i = 0; i < 12; i++) {
    const suffix =
      i === 0
        ? ""
        : String(
            Math.floor(Math.random() * 10 ** (Math.min(i, 3) + 1)),
          ).padStart(Math.min(i, 3) + 1, "0");
    const candidate = `${base}${suffix}`.slice(0, USERNAME_MAX);
    const f = validateUsernameFormat(candidate);
    if (f.ok && !(await isUsernameTaken(f.username))) return f.username;
  }
  return `user${Date.now().toString(36)}`.slice(0, USERNAME_MAX);
}

/** Gives an existing account without a username one. Safe to call repeatedly and concurrently. */
export async function ensureUsername(
  userId: string,
  email: string,
): Promise<string | null> {
  await connectDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = await generateUsername(email);
    try {
      const res = await User.updateOne(
        {
          _id: userId,
          $or: [
            { username: { $exists: false } },
            { username: null },
            { username: "" },
          ],
        },
        { username, usernameChosen: false },
      );
      if (res.matchedCount === 0) {
        const u = await User.findById(userId).select("username").lean();
        return (u?.username as string | undefined) ?? null;
      }
      return username;
    } catch (e) {
      if (!(e instanceof Error && /E11000|duplicate key/i.test(e.message)))
        throw e;
    }
  }
  return null;
}
