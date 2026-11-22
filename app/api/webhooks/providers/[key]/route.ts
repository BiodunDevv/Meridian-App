import { NextResponse } from "next/server";

import { connectDb } from "@/lib/db";
import { Provider } from "@/lib/models";
import { createAdapter } from "@/lib/providers";
import type { Mode } from "@/lib/providers/types";
import { reportError } from "@/lib/services/errors";
import { handleProviderEvent } from "@/lib/services/fulfilment";

/**
 * Callback from a fulfilment provider. It fails closed: an unknown provider, a missing or wrong secret, or an
 * unreadable body is refused. A callback that carries no signature is only a hint: the result is confirmed with the
 * provider's own status call before any order changes. Duplicates are harmless because every change is guarded.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  await connectDb();
  const doc = await Provider.findOne({ key }).lean();
  const adapter = doc ? createAdapter(key, doc.mode as Mode) : null;
  if (!adapter)
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const raw = await req.text();
  const ev = adapter.parseWebhook(
    req.headers,
    raw,
    new URL(req.url).searchParams,
  );
  if (!ev)
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  try {
    await handleProviderEvent(adapter, ev);
    // VTpass wants a quick acknowledgement in this shape; other providers ignore the body.
    return NextResponse.json({ response: "success" });
  } catch (e) {
    await reportError(`webhook.provider.${key}`, e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
