import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CoinLogo, NetworkLogo } from "@/components/app/coin-logo";
import { CopyField } from "@/components/app/copy-field";
import { LiveRefresh } from "@/components/app/live-refresh";
import { StepList, type TimelineStep } from "@/components/app/payment-timeline";
import { PrintButton } from "@/components/app/print-button";
import { Panel, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { explorerTxUrl } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { Withdrawal } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { syncWithdrawal } from "@/lib/services/payment-events";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Withdrawal" };

type W = {
  _id: string;
  reference?: string;
  asset: string;
  network: string;
  address: string;
  amountCents: number;
  status: "pending" | "processing" | "paid" | "rejected";
  provider?: string;
  txHash?: string;
  reason?: string;
  createdAt: string;
  reviewedAt?: string;
};

const LABEL: Record<string, string> = {
  pending: "Under review",
  processing: "Sending",
  paid: "Paid",
  rejected: "Rejected",
};

export default async function WithdrawalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  await connectDb();
  await syncWithdrawal(id).catch(() => {});
  const doc = await Withdrawal.findOne({ _id: id, userId: user.id })
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const w = plain(doc) as W;
  const explorer = w.txHash ? explorerTxUrl(w.network, w.txHash) : null;

  const steps: TimelineStep[] = [
    {
      label: "Request received",
      sub: formatDateTime(w.createdAt),
      state: "done",
    },
    {
      label: "Amount held",
      sub: "Taken from your available balance",
      state: "done",
    },
    {
      label: w.provider ? "Checked automatically" : "Reviewed by our team",
      sub:
        w.status === "pending"
          ? "In progress"
          : w.reviewedAt
            ? formatDateTime(w.reviewedAt)
            : undefined,
      state:
        w.status === "pending"
          ? "current"
          : w.status === "rejected"
            ? "failed"
            : "done",
    },
    {
      label:
        w.status === "rejected"
          ? "Returned to your balance"
          : "Paid to your wallet",
      sub:
        w.status === "paid" && w.reviewedAt
          ? formatDateTime(w.reviewedAt)
          : w.status === "processing"
            ? "Sending now"
            : undefined,
      state:
        w.status === "pending"
          ? "todo"
          : w.status === "processing"
            ? "current"
            : "done",
    },
  ];

  return (
    <>
      <Link
        href="/dashboard/withdraw"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm print:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All withdrawals
      </Link>
      {(w.status === "pending" || w.status === "processing") && (
        <LiveRefresh seconds={10} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinLogo symbol={w.asset} className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Withdraw {formatUsd(w.amountCents)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {w.reference ?? "Withdrawal"} ·{" "}
              <span className="tabular-nums">
                {formatDateTime(w.createdAt)}
              </span>
            </p>
          </div>
        </div>
        <StatusBadge status={w.status} label={LABEL[w.status]} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {w.status === "processing" && (
            <Panel>
              <div className="flex items-start gap-3">
                <Clock
                  className="text-brand mt-0.5 size-6 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="font-semibold">Your payout is on its way</h2>
                  <p className="text-muted-foreground text-sm">
                    {formatUsd(w.amountCents)} passed our automatic checks and
                    is being sent to your wallet now. It usually arrives within
                    a few minutes, depending on the network. This page updates
                    by itself, and we will email you when it is done.
                  </p>
                </div>
              </div>
            </Panel>
          )}
          {w.status === "pending" && (
            <Panel>
              <div className="flex items-start gap-3">
                <Clock
                  className="text-brand mt-0.5 size-6 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="font-semibold">
                    Your request is being reviewed
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {formatUsd(w.amountCents)} is on hold. Our team checks each
                    request and sends the payout to your wallet. This page
                    updates by itself, and we will email you and notify you in
                    the app when it is paid.
                  </p>
                </div>
              </div>
            </Panel>
          )}
          {w.status === "paid" && (
            <Panel>
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="text-success mt-0.5 size-7 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Withdrawal paid</h2>
                  <p className="text-muted-foreground text-sm">
                    {formatUsd(w.amountCents)} was sent to your wallet
                    {w.reviewedAt ? ` on ${formatDateTime(w.reviewedAt)}` : ""}.
                    Depending on the network it can take a few minutes to show
                    there.
                  </p>
                </div>
              </div>
              {w.txHash && (
                <div className="space-y-2">
                  <CopyField label="Transaction ID" value={w.txHash} mono />
                  {explorer && (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={explorer}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on block explorer{" "}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                </div>
              )}
              <div className="print:hidden">
                <PrintButton />
              </div>
            </Panel>
          )}
          {w.status === "rejected" && (
            <Panel>
              <div className="flex items-start gap-3">
                <XCircle
                  className="text-destructive-foreground mt-0.5 size-7 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    We could not process this withdrawal
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {w.reason || "The request could not be approved."}{" "}
                    {formatUsd(w.amountCents)} was returned to your available
                    balance. Questions? Contact support and quote{" "}
                    {w.reference ?? "this withdrawal"}.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href="/dashboard/withdraw?new=1">Try again</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/support">Contact support</Link>
                </Button>
              </div>
            </Panel>
          )}

          <Panel title="Payout details">
            <CopyField label={`${w.asset} address`} value={w.address} mono />
            <div className="flex items-center gap-2 text-sm">
              <NetworkLogo network={w.network} className="size-4" />
              <span className="text-muted-foreground">Network:</span>
              <span className="font-medium">{w.network}</span>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Summary">
            <dl className="divide-y text-sm">
              {[
                ["Reference", w.reference ?? "-"],
                ["Amount", formatUsd(w.amountCents)],
                ["Paid as", `${w.asset} on ${w.network}`],
                ["Our fee", "None"],
              ].map(([l, v]) => (
                <div
                  key={l}
                  className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <dt className="text-muted-foreground">{l}</dt>
                  <dd className="text-right font-medium break-all tabular-nums">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Progress">
            <StepList steps={steps} />
          </Panel>
          <p className="text-muted-foreground flex gap-2 text-xs print:hidden">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            We never ask for your password or recovery phrase. Network fees, if
            any, are covered by the payout.
          </p>
        </div>
      </div>
    </>
  );
}
