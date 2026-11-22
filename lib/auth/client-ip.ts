import "server-only";

import { headers } from "next/headers";

import { rateLimit } from "./rate-limit";

/** The caller's address as the host reports it (the first hop of x-forwarded-for). "unknown" when there is none. */
export async function clientIp() {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/** True when this caller (by IP) is still under the limit for `scope`. Use it on anything a signed-out visitor can reach. */
export async function allowIp(scope: string, max: number, windowSec: number) {
  return rateLimit(`ip:${scope}:${await clientIp()}`, max, windowSec);
}
