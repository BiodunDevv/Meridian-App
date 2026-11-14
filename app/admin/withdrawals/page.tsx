import { ArrowRight, Clock, Hourglass, Send } from "lucide-react";
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
import { coinLogo } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { Withdrawal } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Withdrawals" };

type U = { _id: string; email: string };
type Row = {
  _id: string;
  createdAt: string;
  userId: U | null;
  asset: string;
  network: string;
  address: string;
  reference?: string;
  holdReason?: string;
  amountCents: number;
  status: string;
  txHash?: string;
};

const LABEL: Record<string, string> = {
  pending: "Under review",
  processing: "Sending",
  paid: "Paid",
  rejected: "Rejected",
};

const short = (a: string) =>
  a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;

function waited(from: string) {
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

export default async function AdminWithdrawals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = parseParams(await searchParams);
  await connectDb();
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated per request
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [pendRaw, hist, paidAgg, sending] = await Promise.all([
    Withdrawal.find({ status: "pending" })
      .populate("userId", "email")
      .sort({ createdAt: 1 })
      .lean(),
    queryResource("withdrawals", params),
    Withdrawal.aggregate([
      { $match: { status: "paid", reviewedAt: { $gte: since } } },
      { $group: { _id: null, cents: { $sum: "$amountCents" } } },
    ]),
    Withdrawal.countDocuments({ status: "processing" }),
  ]);
  const pend = plain(pendRaw) as Row[];
  const rows = hist.rows as Row[];
  const owed = pend.reduce((n, w) => n + w.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Withdrawals"
        description="The amount is already held from the user. Open a request, send the payout, then record the transaction hash. Rejecting returns the amount to the user."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting to be paid"
          value={String(pend.length)}
          icon={Hourglass}
          hint={
            pend[0] ? `Oldest: ${waited(pend[0].createdAt)}` : "Nothing waiting"
          }
        />
        <StatCard
          label="Owed to users"
          value={formatUsd(owed)}
          icon={Clock}
          tone="gold"
        />
        <StatCard
          label="Sending automatically"
          value={String(sending)}
          icon={Send}
          hint="Passed the automatic checks"
        />
        <StatCard
          label="Paid, last 30 days"
          value={formatUsd((paidAgg as { cents: number }[])[0]?.cents ?? 0)}
          icon={Send}
          tone="positive"
        />
      </div>

      <Panel title={`Needs a person (${pend.length})`}>
        {pend.length === 0 ? (
          <EmptyState
            variant="done"
            title="All caught up"
            body="New requests show up here as soon as they come in."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {pend.map((w) => (
              <li
                key={w._id}
                className="bg-card flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Coin asset={w.asset} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {w.reference ?? "No reference"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {w.asset} · {w.network}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatUsd(w.amountCents)}
                  </p>
                </div>
                <div className="text-muted-foreground space-y-0.5 text-xs">
                  <p className="truncate">
                    <UserLink user={w.userId} />
                  </p>
                  <p className="font-mono">To {short(w.address)}</p>
                  <p>Waiting {waited(w.createdAt)}</p>
                  {w.holdReason && (
                    <p className="text-gold-foreground">{w.holdReason}</p>
                  )}
                </div>
                <Button asChild size="sm" className="mt-auto w-full">
                  <Link href={`/admin/withdrawals/${w._id}`}>
                    Review and pay{" "}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="All withdrawals">
        <TableToolbar
          placeholder="Search reference, user, address or hash"
          dates
          exportResource="withdrawals"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "pending", label: "Under review" },
                { value: "processing", label: "Sending" },
                { value: "paid", label: "Paid" },
                { value: "rejected", label: "Rejected" },
              ],
            },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No withdrawals match"
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
              {rows.map((w) => (
                <TableRow key={w._id}>
                  <TableCell
                    data-label="Reference"
                    className="font-mono text-xs"
                  >
                    <Link
                      href={`/admin/withdrawals/${w._id}`}
                      className="hover:text-brand underline-offset-4 hover:underline"
                    >
                      {w.reference ?? "None"}
                    </Link>
                  </TableCell>
                  <TableCell data-label="User">
                    <UserLink user={w.userId} />
                  </TableCell>
                  <TableCell data-label="Method">
                    <span className="inline-flex items-center gap-2">
                      <Coin asset={w.asset} />
                      {w.asset} · {w.network}
                    </span>
                  </TableCell>
                  <TableCell
                    data-label="Amount"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(w.amountCents)}
                  </TableCell>
                  <TableCell data-label="Date">
                    {formatDateTime(w.createdAt)}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge status={w.status} label={LABEL[w.status]} />
                  </TableCell>
                  <TableCell data-label="">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/withdrawals/${w._id}`}>Details</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/withdrawals"
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
