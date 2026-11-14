import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Cheap first gate: send visitors with no session cookie to /login.
 * Real authorization (role, status, MFA) is enforced server-side in
 * lib/auth/guards.ts on every page, action and route handler.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.has("apx_session")) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/receipt/:path*"],
};
