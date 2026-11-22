import "server-only";

import { redirect } from "next/navigation";

import { can, type Permission } from "./permissions";
import { getCurrentUser } from "./session";

/** Signed-in, verified, active investor or admin. Redirects otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?error=suspended");
  if (!user.emailVerified) redirect("/verify-email?sent=1");
  return user;
}

/** Same as requireUser, and the role must be admin (enforced on every call). */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin")
    redirect(user.role === "staff" ? "/admin" : "/dashboard");
  return user;
}

/**
 * Admin or staff: for the order and support screens only. Anything else must use requireAdmin. To ask for one
 * permission, pass it; the call fails for a role that does not hold it.
 */
export async function requireStaff(perm?: Permission) {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "staff") redirect("/dashboard");
  if (perm && !can(user.role, perm)) redirect("/admin");
  return user;
}

/** For auth pages: bounce signed-in users to their home. */
export async function redirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user?.emailVerified && user.status === "active") {
    redirect(
      user.role === "admin" || user.role === "staff" ? "/admin" : "/dashboard",
    );
  }
}
