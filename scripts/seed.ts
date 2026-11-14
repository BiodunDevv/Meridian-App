/**
 * `npm run seed` creates or updates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD. Nothing else is
 * touched: no users, money, plans or settings are deleted or changed. Safe to run any time, for example to
 * reset a forgotten admin password.
 *
 *   - Account missing  -> created as an admin, email confirmed.
 *   - Account exists   -> password reset, made an admin, email confirmed, unsuspended, all its sessions ended.
 *
 * Add --reset-2fa if the admin lost their authenticator app: it also turns two-step login off for the account.
 * To wipe the whole database and start fresh, use `npm run reset` instead.
 */
import mongoose from "mongoose";

import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Session, User } from "@/lib/models";
import { hashPassword } from "@/lib/services/auth";

async function main() {
  const env = getEnv();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local first.");
    process.exit(1);
  }
  await connectDb();
  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  const existing = await User.findOne({ email });

  if (!existing) {
    await User.create({
      email,
      name: "Administrator",
      role: "admin",
      passwordHash,
      emailVerifiedAt: new Date(),
    });
    console.log(`Admin created: ${email}`);
  } else {
    existing.passwordHash = passwordHash;
    existing.role = "admin";
    existing.status = "active";
    existing.emailVerifiedAt = existing.emailVerifiedAt ?? new Date();
    if (process.argv.includes("--reset-2fa") && existing.mfa) {
      existing.mfa.enabled = false;
      existing.mfa.secretEnc = undefined;
      existing.mfa.recoveryHashes = [];
    }
    await existing.save();
    const { deletedCount } = await Session.deleteMany({ userId: existing._id });
    console.log(
      `Admin updated: ${email} (password reset, ${deletedCount} session(s) ended${
        process.argv.includes("--reset-2fa")
          ? ", two-step login turned off"
          : ""
      })`,
    );
  }
  console.log("No other data was changed.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
