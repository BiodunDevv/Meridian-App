import { NextResponse } from "next/server";

import { exportCsv, isResource, parseParams } from "@/lib/admin/resources";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { audit } from "@/lib/services/notify";

/** CSV export of any admin table, honouring the same search and filters as the page. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ resource: string }> },
) {
  const { resource } = await ctx.params;
  // Staff may export orders only. Every other table is admin only.
  const admin =
    resource === "orders"
      ? await requireStaff("orders.view")
      : await requireAdmin();
  if (!isResource(resource))
    return NextResponse.json({ error: "Unknown resource" }, { status: 404 });
  const params = parseParams(Object.fromEntries(new URL(req.url).searchParams));
  const csv = await exportCsv(resource, params);
  await audit(admin, "export.csv", resource, {
    q: params.q,
    status: params.status,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="meridian-${resource}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
