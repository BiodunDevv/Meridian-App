/**
 * Who may do what in the admin. The rule lives here once and is checked in THREE places: on every admin page, in
 * every server action, and again inside the service functions that move money or change an order. Hiding a button
 * is never the protection.
 *
 *  admin: everything.
 *  staff: handle orders and support. Cannot change pricing, the catalogue, providers, settings, payment methods or
 *         users, cannot refund to crypto, cannot reveal a customer's code, and cannot see cost or margin.
 *  investor (a customer): nothing in the admin.
 */
export type Role = "investor" | "staff" | "admin";

export const PERMISSIONS = [
  "orders.view",
  "orders.retry",
  "orders.note",
  "orders.resend",
  "orders.refund_credit",
  "orders.mark_delivered",
  "orders.cancel",
  "support.reply",
  "orders.refund_crypto",
  "orders.reveal",
  "orders.view_cost",
  "catalogue.edit",
  "pricing.edit",
  "providers.edit",
  "settings.edit",
  "users.edit",
  "money.queues",
  "reports.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const STAFF: ReadonlySet<Permission> = new Set([
  "orders.view",
  "orders.retry",
  "orders.note",
  "orders.resend",
  "orders.refund_credit",
  "orders.mark_delivered",
  "orders.cancel",
  "support.reply",
]);

export function can(
  role: Role | string | undefined,
  perm: Permission,
): boolean {
  if (role === "admin") return true;
  if (role === "staff") return STAFF.has(perm);
  return false;
}

export class PermissionError extends Error {
  constructor(perm: Permission) {
    super(`You do not have permission to do this (${perm}).`);
  }
}

/** Throws unless the actor holds the permission. Call it inside services, not only in actions. */
export function assertCan(
  actor: { role?: string } | null | undefined,
  perm: Permission,
) {
  if (!actor || !can(actor.role, perm)) throw new PermissionError(perm);
}
