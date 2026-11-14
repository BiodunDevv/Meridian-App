import { ArrowUpRight, Clock, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CoinLogo } from "@/components/app/coin-logo";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/app/ui";
import { WithdrawModal } from "@/components/app/withdraw-modal";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Asset, User, Withdrawal } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";
import { kycStatus, MIN_WITHDRAWAL_CENTS } from "@/lib/services/withdrawals";

export const metadata: Metadata = { title: "Withdraw" };

const LABEL: Record<string, string> = {
  pending: "Under review",
  processing: "Sending",
  paid: "Paid",
  rejected: "Rejected",
};

type W = {
  _id: string;
  createdAt: string;
  asset: string;
  network: string;
  address: string;
  amountCents: number;
  status: string;
  txHash?: string;
  reason?: string;
};

const short = (a: string) =>
  a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;

export default async function WithdrawPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  await connectDb();
  const [kyc, assets, list, u] = await Promise.all([
    kycStatus(user.id),
    Asset.find({ active: true }).sort({ symbol: 1 }).lean(),
    Withdrawal.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    User.findById(user.id).lean(),
  ]);
  const options = plain(assets)
    .map(
      (a: {
        symbol: string;
        name: string;
        networks: { name: string; active: boolean }[];
      }) => ({
        symbol: a.symbol,
        name: a.name,
        networks: a.networks
          .filter((n) => n.active)
          .map((n) => ({ name: n.name })),
      }),
    )
    .filter((a: { networks: unknown[] }) => a.networks.length > 0);
  const rows = plain(list) as W[];
  const available = u?.balanceCents ?? 0;
  const onHold = rows
    .filter((w) => w.status === "pending")
    .reduce((n, w) => n + w.amountCents, 0);
  const paid = rows
    .filter((w) => w.status === "paid")
    .reduce((n, w) => n + w.amountCents, 0);

  return (
    <>
      <PageHeader
        title="Withdraw"
        description="Move your available balance to your own wallet."
        action={
          kyc === "approved" && options.length > 0 ? (
            <WithdrawModal
              assets={options}
              available={available}
              minCents={MIN_WITHDRAWAL_CENTS}
              defaultOpen={sp.new === "1"}
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Available to withdraw"
          value={formatUsd(available)}
          icon={Wallet}
        />
        <StatCard
          label="On hold, under review"
          value={formatUsd(onHold)}
          icon={Clock}
          tone="gold"
        />
        <StatCard
          label="Paid out so far"
          value={formatUsd(paid)}
          icon={ArrowUpRight}
          tone="positive"
        />
      </div>

      {kyc !== "approved" ? (
        <Panel>
          <EmptyState
            title={
              kyc === "pending"
                ? "Verification under review"
                : "Verify your identity first"
            }
            body={
              kyc === "pending"
                ? "Withdrawals unlock once our team approves your details."
                : "Identity (KYC) verification is required before your first withdrawal."
            }
            action={
              kyc !== "pending" ? (
                <Button asChild size="sm">
                  <Link href="/dashboard/settings">Verify identity</Link>
                </Button>
              ) : undefined
            }
          />
        </Panel>
      ) : options.length === 0 ? (
        <Panel>
          <EmptyState
            title="Withdrawals are not available right now"
            body="No payout methods are enabled at the moment. Please check back soon."
          />
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          ["1", "Request", "The amount is held from your balance right away."],
          ["2", "Review", "Our team checks the request and your address."],
          ["3", "Paid", "We send the funds and show the transaction ID."],
        ].map(([n, t, d]) => (
          <div key={n} className="bg-card flex gap-3 rounded-xl border p-4">
            <span className="bg-brand/10 text-brand flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              {n}
            </span>
            <span className="text-sm">
              <span className="font-medium">{t}</span>
              <span className="text-muted-foreground block text-xs">{d}</span>
            </span>
          </div>
        ))}
      </div>

      <Panel title="Withdrawal history">
        {rows.length === 0 ? (
          <EmptyState
            title="No withdrawals yet"
            body="Requested payouts and their status will appear here."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((w) => {
              return (
                <li key={w._id} className="first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/withdraw/${w._id}`}
                    className="hover:bg-accent/40 -mx-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg px-2 py-3 transition-colors"
                  >
                    <CoinLogo symbol={w.asset} className="size-9" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {w.asset}{" "}
                        <span className="text-muted-foreground font-normal">
                          · {w.network}
                        </span>
                      </p>
                      <p className="text-muted-foreground truncate font-mono text-xs">
                        To {short(w.address)}
                      </p>
                      {w.txHash && (
                        <p className="text-muted-foreground truncate font-mono text-xs">
                          Tx {short(w.txHash)}
                        </p>
                      )}
                      {w.status === "rejected" && w.reason && (
                        <p className="text-destructive-foreground text-xs">
                          {w.reason}
                        </p>
                      )}
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatUsd(w.amountCents)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(w.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={w.status} label={LABEL[w.status]} />
                    <span className="text-brand w-full text-sm font-medium sm:hidden">
                      View details →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
