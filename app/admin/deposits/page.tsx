import { ArrowRight, Clock, Coins, Hourglass, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/app/ui";
import { UserLink } from "@/components/app/user-link";
import { Button } from "@/components/ui/button";
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
import { coinLogo } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { depositLabel } from "@/lib/deposit-status";
import { formatCrypto } from "@/lib/format-crypto";
import { Deposit } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Deposits" };

type U = { _id: string; email: string };
type Row = {
  _id: string;
  createdAt: string;
  userId: U | null;
  asset: string;
  network: string;
  amountCents: number;
  txRef?: string;
  reference?: string;
  submittedAt?: string;
  creditedCents?: number;
  cryptoAmount?: number;
  provider?: string;
  status: string;
  reason?: string;
};

function waited(from?: string) {
  if (!from) return "";
  const m = Math.max(
    0,
    Math.round((Date.now() - new Date(from).getTime()) / 60000),
  );
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
}

function Coin({ asset }: { asset: string }) {
  const logo = coinLogo(asset);
  return logo ? (
    <Image
      src={logo}
      alt=""
      width={20}
      height={20}
      className="size-5"
      unoptimized
    />
  ) : null;
}

export default async function AdminDeposits({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = parseParams(await searchParams);
  await connectDb();
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated per request
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [pendRaw, hist, credited, unpaid] = await Promise.all([
    Deposit.find({
      status: "pending",
      $or: [
        { provider: { $exists: false } },
        { providerStatus: "partially_paid" },
      ],
    })
      .populate("userId", "email")
      .sort({ submittedAt: 1, createdAt: 1 })
      .lean(),
    queryResource("deposits", params),
    Deposit.aggregate([
      { $match: { status: "approved", reviewedAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          cents: { $sum: { $ifNull: ["$creditedCents", "$amountCents"] } },
        },
      },
    ]),
    Deposit.countDocuments({ status: "awaiting" }),
  ]);
  const pending = plain(pendRaw) as Row[];
  const rows = hist.rows as Row[];
  const pendingCents = pending.reduce((n, d) => n + d.amountCents, 0);
  const oldest = pending[0];

  return (
    <>
      <PageHeader
        title="Deposits"
        description="Review payments users say they have sent. Open one to see the full details, check the transaction, then approve or reject."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting for review"
          value={String(pending.length)}
          icon={Hourglass}
          hint={
            oldest
              ? `Oldest: ${waited(oldest.submittedAt ?? oldest.createdAt)}`
              : "Nothing waiting"
          }
        />
        <StatCard
          label="Value in review"
          value={formatUsd(pendingCents)}
          icon={Wallet}
          tone="gold"
        />
        <StatCard
          label="Credited, last 30 days"
          value={formatUsd((credited as { cents: number }[])[0]?.cents ?? 0)}
          icon={Coins}
          tone="positive"
        />
        <StatCard
          label="Awaiting payment"
          value={String(unpaid)}
          icon={Clock}
          hint="Created, not yet marked as paid"
        />
      </div>

      <Panel title={`Needs review (${pending.length})`}>
        {pending.length === 0 ? (
          <EmptyState
            variant="done"
            title="All caught up"
            body="New requests show up here as soon as users mark them as paid."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {pending.map((d) => (
              <li
                key={d._id}
                className="bg-card flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Coin asset={d.asset} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {d.reference ?? "No reference"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {d.asset} · {d.network}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatUsd(d.amountCents)}
                  </p>
                </div>
                <div className="text-muted-foreground space-y-0.5 text-xs">
                  <p className="truncate">
                    <UserLink user={d.userId} />
                  </p>
                  {d.cryptoAmount ? (
                    <p>Expect {formatCrypto(d.asset, d.cryptoAmount)}</p>
                  ) : null}
                  <p>Waiting {waited(d.submittedAt ?? d.createdAt)}</p>
                </div>
                <Button asChild size="sm" className="mt-auto w-full">
                  <Link href={`/admin/deposits/${d._id}`}>
                    Review details{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="All deposits">
        <TableToolbar
          placeholder="Search reference, user, asset or transaction"
          dates
          exportResource="deposits"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "awaiting", label: "Awaiting payment" },
                { value: "pending", label: "Under review" },
                { value: "approved", label: "Credited" },
                { value: "rejected", label: "Rejected" },
                { value: "expired", label: "Expired" },
                { value: "cancelled", label: "Cancelled" },
              ],
            },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No deposits match"
            body="Try a different search or clear the filters."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d._id}>
                  <TableCell
                    data-label="Reference"
                    className="font-mono text-xs"
                  >
                    <Link
                      href={`/admin/deposits/${d._id}`}
                      className="hover:text-brand underline-offset-4 hover:underline"
                    >
                      {d.reference ?? "None"}
                    </Link>
                  </TableCell>
                  <TableCell data-label="User">
                    <UserLink user={d.userId} />
                  </TableCell>
                  <TableCell data-label="Method">
                    <span className="inline-flex items-center gap-2">
                      <Coin asset={d.asset} />
                      {d.asset} · {d.network}
                    </span>
                  </TableCell>
                  <TableCell
                    data-label="Amount"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(d.amountCents)}
                    {d.creditedCents != null &&
                      d.creditedCents !== d.amountCents && (
                        <span className="text-muted-foreground block text-xs">
                          Credited {formatUsd(d.creditedCents)}
                        </span>
                      )}
                  </TableCell>
                  <TableCell data-label="Date">
                    {formatDateTime(d.createdAt)}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge
                      status={d.status}
                      label={depositLabel(d.status, d.provider)}
                    />
                  </TableCell>
                  <TableCell data-label="">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/deposits/${d._id}`}>Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/deposits"
          query={paramsToQuery(params)}
          page={hist.page}
          pages={hist.pages}
          total={hist.total}
          pageSize={hist.pageSize}
        />
      </Panel>
    </>
  );
}
