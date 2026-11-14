import { NextResponse } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { reconcilePayments } from "@/lib/services/payment-events";

/** Re-checks open payments and payouts with the provider, in case a callback was missed. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${getEnv().CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await reconcilePayments()) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
