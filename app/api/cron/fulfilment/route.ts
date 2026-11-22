import { NextResponse } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { reportError } from "@/lib/services/errors";
import { runFulfilmentJob } from "@/lib/services/fulfilment";

export const maxDuration = 60;

/** Claims stranded paid orders, advances due ones, and checks provider float. Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${getEnv().CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runFulfilmentJob()) });
  } catch (e) {
    await reportError("cron.fulfilment", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
