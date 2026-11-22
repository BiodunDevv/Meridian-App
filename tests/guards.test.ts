// @ts-nocheck
/* eslint-disable */
// Static check that every admin page, action and route guards itself with the right role.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (p: string) => p.slice(ROOT.length + 1);

async function main() {
  /* ---------- the permission matrix ---------- */
  const { can, PERMISSIONS, assertCan, PermissionError } = await import(
    `${ROOT}/lib/auth/permissions`
  );
  const STAFF_OK = [
    "orders.view",
    "orders.retry",
    "orders.note",
    "orders.resend",
    "orders.refund_credit",
    "orders.mark_delivered",
    "orders.cancel",
    "support.reply",
  ];
  for (const p of PERMISSIONS) {
    assert.equal(can("admin", p), true, `admin ${p}`);
    assert.equal(can("staff", p), STAFF_OK.includes(p), `staff ${p}`);
    assert.equal(can("investor", p), false, `customer ${p}`);
    assert.equal(can(undefined, p), false);
  }
  for (const forbidden of [
    "pricing.edit",
    "providers.edit",
    "settings.edit",
    "catalogue.edit",
    "orders.refund_crypto",
    "orders.reveal",
    "orders.view_cost",
    "users.edit",
    "money.queues",
    "reports.view",
  ])
    assert.equal(
      can("staff", forbidden as never),
      false,
      `staff must not ${forbidden}`,
    );
  assert.throws(
    () => assertCan({ role: "staff" }, "orders.refund_crypto"),
    PermissionError,
  );
  assert.throws(() => assertCan(null, "orders.view"), PermissionError);

  /* ---------- every server action checks the caller, as the right role ---------- */
  const actionFiles = walk(join(ROOT, "app/actions")).filter((f) =>
    f.endsWith(".ts"),
  );
  const USER_FILES = new Set(["auth.ts", "user.ts", "orders.ts"]); // customer-facing: requireUser / public
  let checked = 0;
  for (const f of actionFiles) {
    const name = f.split("/").pop()!;
    const src = readFileSync(f, "utf8");
    // split into exported async functions
    const parts = src.split(/\nexport async function /).slice(1);
    for (const part of parts) {
      const fn = part.slice(0, part.indexOf("(")).trim();
      const head = part.slice(0, 900);
      if (USER_FILES.has(name)) continue;
      if (name === "support.ts") {
        if (/^admin/.test(fn))
          assert.match(
            head,
            /requireStaff\("support\.reply"\)/,
            `${name}:${fn}`,
          );
        else assert.match(head, /requireUser\(\)/, `${name}:${fn}`);
      } else if (name === "order-admin.ts") {
        assert.match(
          head,
          /act\("orders\.[a-z_]+"|requireStaff\("orders\.[a-z_]+"\)/,
          `${name}:${fn}`,
        );
      } else {
        // admin.ts, catalogue.ts, messages.ts, reconcile.ts and anything else: ADMIN ONLY
        assert.match(
          head,
          /requireAdmin\(\)/,
          `${name}:${fn} must call requireAdmin()`,
        );
        assert.doesNotMatch(
          head,
          /requireStaff/,
          `${name}:${fn} must not allow staff`,
        );
      }
      checked++;
    }
  }
  assert.ok(checked > 60, `checked ${checked} actions`);

  /* ---------- the order services enforce permissions themselves ---------- */
  const svc = readFileSync(join(ROOT, "lib/services/order-admin.ts"), "utf8");
  const exportsSvc = svc.split(/\nexport async function /).slice(1);
  for (const part of exportsSvc) {
    const fn = part.slice(0, part.indexOf("(")).trim();
    if (fn === "orderEventsForAdmin") continue;
    assert.match(
      part.slice(0, 500),
      /need\(actor, "orders\.[a-z_]+"\)/,
      `service ${fn} must check permission`,
    );
  }

  /* ---------- every admin page and route handler guards itself ---------- */
  const STAFF_PAGES = new Set([
    "app/admin/page.tsx",
    "app/admin/orders/page.tsx",
    "app/admin/orders/[id]/page.tsx",
    "app/admin/support/page.tsx",
    "app/admin/support/[id]/page.tsx",
  ]);
  const pages = walk(join(ROOT, "app/admin")).filter((f) =>
    f.endsWith("/page.tsx"),
  );
  for (const f of pages) {
    const src = readFileSync(f, "utf8");
    const i = src.indexOf("export default");
    const body = src.slice(i, i + 900);
    if (STAFF_PAGES.has(rel(f))) assert.match(body, /requireStaff\(/, rel(f));
    else {
      assert.match(
        body,
        /requireAdmin\(\)/,
        `${rel(f)} must call requireAdmin()`,
      );
      assert.doesNotMatch(
        body,
        /requireStaff/,
        `${rel(f)} must not allow staff`,
      );
    }
  }
  const routes = walk(join(ROOT, "app/admin")).filter((f) =>
    f.endsWith("/route.ts"),
  );
  assert.ok(routes.length >= 3);
  for (const f of routes)
    assert.match(
      readFileSync(f, "utf8"),
      /requireAdmin\(\)|requireStaff\(/,
      rel(f),
    );
  // staff may export orders only
  const exp = readFileSync(
    join(ROOT, "app/admin/export/[resource]/route.ts"),
    "utf8",
  );
  assert.match(
    exp,
    /resource === "orders"[\s\S]{0,40}requireStaff\("orders\.view"\)[\s\S]{0,40}requireAdmin\(\)/,
  );
  // the admin layout lets staff in, so the pages above are what keep them out
  assert.match(
    readFileSync(join(ROOT, "app/admin/layout.tsx"), "utf8"),
    /requireStaff\(\)/,
  );
  console.log(
    `guard checks passed (${checked} actions, ${pages.length} pages, ${routes.length} routes)`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
