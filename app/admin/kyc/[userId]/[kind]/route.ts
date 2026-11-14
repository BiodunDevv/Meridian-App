import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Kyc } from "@/lib/models";
import { audit } from "@/lib/services/notify";
import { downloadDocument } from "@/lib/storage/cloudinary";

/**
 * Streams one identity document to a signed-in admin. The file has no public link: this route checks the
 * admin, fetches it from private storage with a signed request and never caches it. Every view is audited.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string; kind: string }> },
) {
  const admin = await requireAdmin();
  const { userId, kind } = await ctx.params;
  if (
    !/^[a-f\d]{24}$/i.test(userId) ||
    !["front", "back", "selfie"].includes(kind)
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  await connectDb();
  const k = await Kyc.findOne({ userId }).select("documents").lean();
  const doc = (
    k?.documents as
      { kind: string; publicId: string; format: string }[] | undefined
  )?.find((d) => d.kind === kind);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const file = await downloadDocument(doc);
    await audit(admin, "kyc.view_document", userId, { kind });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.type,
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename="kyc-${kind}.${doc.format}"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load the document" },
      { status: 502 },
    );
  }
}
