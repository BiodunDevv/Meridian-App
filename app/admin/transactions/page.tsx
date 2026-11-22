import {
  ArrowDownLeft,
  ArrowUpRight,
  type LucideIcon,
  RefreshCcw,
  Undo2,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import {
  EmptyState,
  LEDGER_LABEL,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/app/ui";
import { UserLink } from "@/components/app/user-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  paramsToQuery,
  parseParams,
  queryResource,
} from "@/lib/admin/resources";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { LedgerEntry } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions" };

type Row = {
  _id: string;
  userId: { _id: string; email: string } | null;
  createdAt: string;
  type: string;
  note?: string;
  refType?: string;
  refId?: string;
  amountCents: number;
  balanceAfterCents: number;
};

const ICON: Record<string, LucideIcon> = {
  deposit: ArrowDownLeft,
  order_refund: Undo2,
  withdrawal_hold: ArrowUpRight,
  withdrawal_refund: RefreshCcw,
  adjustment: Wallet,
};

function related(r: Row) {
  if (!r.refId) return null;
  if (r.refType === "deposit") return `/admin/deposits/${r.refId}`;
  if (r.refType === "withdrawal") return `/admin/withdrawals/${r.refId}`;
  return null;
}

export default async function AdminTransactions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = parseParams(await searchParams);
  await connectDb();
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated per request
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [{ rows, total, page, pages, pageSize }, sums] = await Promise.all([
    queryResource("transactions", params),
    LedgerEntry.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$type", cents: { $sum: "$amountCents" } } },
    ]) as Promise<{ _id: string; cents: number }[]>,
  ]);
  const data = rows as Row[];
  const sum = (t: string) => sums.find((s) => s._id === t)?.cents ?? 0;
  // Withdrawals are held (negative) and refunded (positive) when rejected.
  const out = -(sum("withdrawal_hold") + sum("withdrawal_refund"));

  return (
    <>
      <PageHeader
        title="Transactions"
        description="The platform ledger. Every money movement is recorded here with the balance it left behind."
      />

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Deposits, 30 days"
          value={formatUsd(sum("deposit"))}
          icon={ArrowDownLeft}
          tone="positive"
        />
        <StatCard
          label="Withdrawals, 30 days"
          value={formatUsd(out)}
          icon={ArrowUpRight}
          hint="Net of refunds"
        />
      </div>

      <Panel>
        <TableToolbar
          placeholder="Search user or detail"
          dates
          exportResource="transactions"
          filters={[
            {
              key: "type",
              label: "Type",
              options: Object.entries(LEDGER_LABEL).map(([value, label]) => ({
                value,
                label,
              })),
            },
          ]}
        />
        {data.length === 0 ? (
          <EmptyState
            title="No transactions match"
            body="Try a different search or clear the filters."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance after</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => {
                const Icon = ICON[e.type] ?? Wallet;
                const href = related(e);
                const credit = e.amountCents >= 0;
                return (
                  <TableRow key={e._id}>
                    <TableCell data-label="Date">
                      {formatDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell data-label="User">
                      <UserLink user={e.userId} />
                    </TableCell>
                    <TableCell data-label="Type">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`flex size-6 items-center justify-center rounded-full ${credit ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}
                        >
                          <Icon className="size-3.5" aria-hidden="true" />
                        </span>
                        <span>
                          {LEDGER_LABEL[e.type] ?? e.type}
                          {e.note && (
                            <span className="text-muted-foreground block max-w-56 truncate text-xs">
                              {e.note}
                            </span>
                          )}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell
                      data-label="Amount"
                      className={`text-right font-medium tabular-nums ${credit ? "text-success" : ""}`}
                    >
                      {credit ? "+" : ""}
                      {formatUsd(e.amountCents)}
                    </TableCell>
                    <TableCell
                      data-label="Balance after"
                      className="text-right tabular-nums"
                    >
                      {formatUsd(e.balanceAfterCents)}
                    </TableCell>
                    <TableCell data-label="">
                      {href && (
                        <Link
                          href={href}
                          className="text-brand text-xs font-medium underline-offset-4 hover:underline max-sm:w-full max-sm:rounded-md max-sm:border max-sm:py-2 max-sm:text-center max-sm:text-sm"
                        >
                          View details
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/transactions"
          query={paramsToQuery(params)}
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
        />
      </Panel>
    </>
  );
}
