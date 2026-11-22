import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { formatUsd } from "@/lib/money";
import { type Dim, reportBy } from "@/lib/services/reports";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const DIMS: [Dim, string][] = [
  ["day", "By day"],
  ["product", "By product"],
  ["category", "By category"],
  ["provider", "By provider"],
];

function parseRange(sp: Record<string, string | undefined>) {
  const now = Date.now();
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999Z`) : new Date(now);
  const from = sp.from
    ? new Date(`${sp.from}T00:00:00.000Z`)
    : new Date(now - 30 * 86_400_000);
  return {
    from: Number.isNaN(from.getTime()) ? new Date(now - 30 * 86_400_000) : from,
    to: Number.isNaN(to.getTime()) ? new Date(now) : to,
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const dim = (DIMS.find(([d]) => d === sp.dim)?.[0] ?? "day") as Dim;
  const { from, to } = parseRange(sp);
  const rows = await reportBy(dim, from, to);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const qs = `from=${iso(from)}&to=${iso(to)}`;
  const total = rows.reduce(
    (t, r) => ({
      delivered: t.delivered + r.delivered,
      revenue: t.revenue + r.revenue,
      cost: t.cost + r.cost,
      margin: t.margin + r.margin,
      refunded: t.refunded + r.refunded,
      paid: t.paid + r.paid,
    }),
    { delivered: 0, revenue: 0, cost: 0, margin: 0, refunded: 0, paid: 0 },
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Revenue counts delivered orders only. All amounts are in US dollars; naira orders use the rate they were sold at. Cost and margin come from each order's price snapshot."
        action={
          <Link
            href={`/admin/reports/export?dim=${dim}&${qs}`}
            className="border-input hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
          >
            <Download className="size-4" aria-hidden="true" /> Export CSV
          </Link>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-muted/50 inline-flex flex-wrap gap-1 rounded-lg border p-1">
          {DIMS.map(([d, label]) => (
            <Link
              key={d}
              href={`/admin/reports?dim=${d}&${qs}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${dim === d ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="dim" value={dim} />
          <label className="space-y-1">
            <span className="text-muted-foreground block text-xs">From</span>
            <input
              type="date"
              name="from"
              defaultValue={iso(from)}
              className="border-input bg-background h-9 rounded-md border px-2"
            />
          </label>
          <label className="space-y-1">
            <span className="text-muted-foreground block text-xs">To</span>
            <input
              type="date"
              name="to"
              defaultValue={iso(to)}
              className="border-input bg-background h-9 rounded-md border px-2"
            />
          </label>
          <button className="bg-primary text-primary-foreground h-9 rounded-md px-3 font-medium">
            Apply
          </button>
        </form>
      </div>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing in this period"
            body="Delivered orders, payments and refunds in the dates you chose appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {dim === "day" ? "Day" : dim[0].toUpperCase() + dim.slice(1)}
                </TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">Refunded</TableHead>
                <TableHead className="text-right">Refund rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell data-label={dim}>{r.key}</TableCell>
                  <TableCell
                    data-label="Delivered"
                    className="text-right tabular-nums"
                  >
                    {r.delivered}
                  </TableCell>
                  <TableCell
                    data-label="Revenue"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(r.revenue)}
                  </TableCell>
                  <TableCell
                    data-label="Cost"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(r.cost)}
                  </TableCell>
                  <TableCell
                    data-label="Margin"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(r.margin)}
                  </TableCell>
                  <TableCell
                    data-label="Margin %"
                    className="text-right tabular-nums"
                  >
                    {r.revenue
                      ? `${((r.margin / r.revenue) * 100).toFixed(1)}%`
                      : "-"}
                  </TableCell>
                  <TableCell
                    data-label="Refunded"
                    className="text-right tabular-nums"
                  >
                    {r.refunded} · {formatUsd(r.refundedAmount)}
                  </TableCell>
                  <TableCell
                    data-label="Refund rate"
                    className="text-right tabular-nums"
                  >
                    {r.paid ? `${(r.refundRate * 100).toFixed(1)}%` : "-"}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell data-label="Total" className="font-semibold">
                  Total
                </TableCell>
                <TableCell
                  data-label="Delivered"
                  className="text-right font-semibold tabular-nums"
                >
                  {total.delivered}
                </TableCell>
                <TableCell
                  data-label="Revenue"
                  className="text-right font-semibold tabular-nums"
                >
                  {formatUsd(total.revenue)}
                </TableCell>
                <TableCell
                  data-label="Cost"
                  className="text-right font-semibold tabular-nums"
                >
                  {formatUsd(total.cost)}
                </TableCell>
                <TableCell
                  data-label="Margin"
                  className="text-right font-semibold tabular-nums"
                >
                  {formatUsd(total.margin)}
                </TableCell>
                <TableCell
                  data-label="Margin %"
                  className="text-right font-semibold tabular-nums"
                >
                  {total.revenue
                    ? `${((total.margin / total.revenue) * 100).toFixed(1)}%`
                    : "-"}
                </TableCell>
                <TableCell
                  data-label="Refunded"
                  className="text-right font-semibold tabular-nums"
                >
                  {total.refunded}
                </TableCell>
                <TableCell
                  data-label="Refund rate"
                  className="text-right font-semibold tabular-nums"
                >
                  {total.paid
                    ? `${((total.refunded / total.paid) * 100).toFixed(1)}%`
                    : "-"}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
