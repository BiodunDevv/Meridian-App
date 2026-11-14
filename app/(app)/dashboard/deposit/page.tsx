import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DepositModal } from "@/components/app/deposit-modal";
import { MobileDetails } from "@/components/app/mobile-details";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { depositLabel } from "@/lib/deposit-status";
import { formatCrypto } from "@/lib/format-crypto";
import { Deposit } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import {
  activeAssets,
  expireStale,
  PAYMENT_WINDOW_MIN,
} from "@/lib/services/deposits";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Deposit" };

type Row = {
  _id: string;
  reference?: string;
  createdAt: string;
  asset: string;
  network: string;
  amountCents: number;
  cryptoAmount?: number;
  provider?: string;
  status: string;
};

export default async function DepositPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  await connectDb();
  await expireStale(user.id);
  const [assets, list] = await Promise.all([
    activeAssets(),
    Deposit.find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);
  const rows = plain(list) as Row[];
  const awaiting = rows.filter((r) => r.status === "awaiting");

  return (
    <>
      <PageHeader
        title="Deposit"
        description="Add funds to your balance with crypto. Create a payment, send from your own wallet, and we credit your balance once it is verified."
        action={
          assets.length ? (
            <DepositModal
              assets={assets}
              windowMin={PAYMENT_WINDOW_MIN}
              defaultOpen={sp.new === "1"}
            />
          ) : undefined
        }
      />

      {awaiting.length > 0 && (
        <div className="border-brand/40 bg-brand/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <span>
            You have {awaiting.length} unpaid payment
            {awaiting.length > 1 ? "s" : ""}. Finish{" "}
            {awaiting.length > 1 ? "one" : "it"} or start a new one below.
          </span>
          <Button asChild size="sm">
            <Link href={`/dashboard/deposit/${awaiting[0]._id}`}>
              Continue payment
            </Link>
          </Button>
        </div>
      )}

      {assets.length === 0 && (
        <Panel>
          <EmptyState
            icon={Wallet}
            title="Deposits are not open yet"
            body="We are setting up funding addresses. Check back shortly, or contact support if this persists."
          />
        </Panel>
      )}

      <Panel title="Your payments">
        {rows.length === 0 ? (
          <EmptyState
            title="No payments yet"
            body="Create your first payment above. You can follow each one here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d._id}>
                  <TableCell data-label="Reference">
                    <Link
                      href={`/dashboard/deposit/${d._id}`}
                      className="hover:text-brand font-medium underline-offset-4 hover:underline"
                    >
                      {d.reference ?? "View"}
                    </Link>
                  </TableCell>
                  <TableCell data-label="Date">
                    {formatDateTime(d.createdAt)}
                  </TableCell>
                  <TableCell data-label="Asset">
                    {d.cryptoAmount
                      ? formatCrypto(d.asset, d.cryptoAmount)
                      : d.asset}{" "}
                    <span className="text-muted-foreground">· {d.network}</span>
                  </TableCell>
                  <TableCell
                    data-label="Amount"
                    className="text-right tabular-nums"
                  >
                    {formatUsd(d.amountCents)}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge
                      status={d.status}
                      label={depositLabel(d.status, d.provider)}
                    />
                  </TableCell>
                  <MobileDetails href={`/dashboard/deposit/${d._id}`} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
