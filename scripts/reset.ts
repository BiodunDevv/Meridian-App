/**
 * Fresh start. `npm run seed` WIPES the whole database (users, deposits,
 * investments, ledger, messages, everything) and recreates:
 *   - the admin account from ADMIN_EMAIL / ADMIN_PASSWORD
 *   - the three plans from content/site.ts
 *   - the popular asset catalogue (no wallet addresses)
 *
 * Because that is irreversible, it asks you to type the database name first.
 * Skip the prompt with:  npm run seed -- --yes
 */
import { createInterface } from "node:readline/promises";

import mongoose from "mongoose";

import { plans } from "@/content/site";
import { POPULAR_ASSETS } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Asset, Plan, User } from "@/lib/models";
import { hashPassword } from "@/lib/services/auth";

async function confirmWipe(dbName: string, host: string) {
  if (process.argv.includes("--yes")) return true;
  if (!process.stdin.isTTY) {
    console.error(
      "Refusing to wipe without confirmation. Re-run with --yes to skip the prompt.",
    );
    return false;
  }
  console.log(
    `\nThis will DELETE ALL DATA in database "${dbName}" on ${host}.`,
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Type the database name (${dbName}) to continue: `,
  );
  rl.close();
  return answer.trim() === dbName;
}

async function main() {
  const env = getEnv();
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local first, so you can log in after the reset.",
    );
    process.exit(1);
  }

  await connectDb();
  const db = mongoose.connection.db!;
  const dbName = db.databaseName;
  const host = mongoose.connection.host || "the configured server";

  if (!(await confirmWipe(dbName, host))) {
    console.log("Cancelled. Nothing was changed.");
    await mongoose.disconnect();
    return;
  }

  // 1. Wipe every collection (keeps the collections and rebuilds indexes below).
  const collections = await db.listCollections().toArray();
  for (const c of collections) {
    if (c.name.startsWith("system.")) continue;
    const { deletedCount } = await db.collection(c.name).deleteMany({});
    console.log(`Cleared ${c.name} (${deletedCount})`);
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  // 2. Admin
  const email = env.ADMIN_EMAIL.toLowerCase();
  await User.create({
    email,
    name: "Administrator",
    role: "admin",
    passwordHash: await hashPassword(env.ADMIN_PASSWORD),
    emailVerifiedAt: new Date(),
  });
  console.log(`\nAdmin created: ${email}`);

  // 3. Plans (from content/site.ts, smallest to largest)
  for (const [i, p] of plans.items.entries()) {
    await Plan.create({
      slug: p.slug,
      name: p.name,
      tagline: p.tagline,
      minCents: p.minUsd * 100,
      maxCents: p.maxUsd * 100,
      durationDays: p.durationDays,
      projectedPct: p.projectedPct,
      sort: i,
      active: true,
    });
  }
  console.log(`Plans created: ${plans.items.length}`);

  // 4. Assets (hidden from users until a wallet address is added)
  await Asset.insertMany(
    POPULAR_ASSETS.map((a, i) => ({
      symbol: a.symbol,
      name: a.name,
      active: true,
      sort: i,
      networks: a.networks.map((n) => ({
        name: n,
        address: "",
        memo: "",
        active: true,
      })),
    })),
  );
  console.log(`Assets created: ${POPULAR_ASSETS.length}`);
  console.log(
    "\nDone. Log in as the admin, then add wallet addresses in Admin > Payment methods.",
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
