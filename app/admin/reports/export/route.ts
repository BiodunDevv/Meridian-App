import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { audit } from "@/lib/services/notify";
import { csvLine, type Dim, reportBy } from "@/lib/services/reports";

const DIMS = ["day", "product", "category", "provider"];

/** CSV of a report. Admin only, and the export is written to the audit log. */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const dim = (
    DIMS.includes(sp.get("dim") ?? "") ? sp.get("dim") : "day"
  ) as Dim;
  const from = new Date(`${sp.get("from") ?? ""}T00:00:00.000Z`);
  const to = new Date(`${sp.get("to") ?? ""}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
    return NextResponse.json({ error: "Bad dates" }, { status: 400 });
  const rows = await reportBy(dim, from, to);
  await audit(admin, "export.report", dim, {
    from: sp.get("from"),
    to: sp.get("to"),
  });
  const d = (c: number) => (c / 100).toFixed(2);
  const csv = [
    csvLine([
      dim,
      "Delivered",
      "Revenue USD",
      "Cost USD",
      "Margin USD",
      "Paid orders",
      "Refunded orders",
      "Refunded USD",
      "Refund rate",
    ]),
    ...rows.map((r) =>
      csvLine([
        r.key,
        r.delivered,
        d(r.revenue),
        d(r.cost),
        d(r.margin),
        r.paid,
        r.refunded,
        d(r.refundedAmount),
        r.refundRate.toFixed(4),
      ]),
    ),
  ].join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="meridian-report-${dim}-${sp.get("from")}-${sp.get("to")}.csv"`,
      "cache-control": "no-store",
    },
  });
}
