import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";

import { cancelDepositAction } from "@/app/actions/user";
import { CoinLogo, NetworkLogo } from "@/components/app/coin-logo";
import { CopyField } from "@/components/app/copy-field";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PaymentCountdown } from "@/components/app/payment-countdown";
import { PaymentTimeline } from "@/components/app/payment-timeline";
import { PrintButton } from "@/components/app/print-button";
import { SubmitPayment } from "@/components/app/submit-payment";
import { ConfirmAction } from "@/components/app/toast-form";
import { Panel, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { depositLabel } from "@/lib/deposit-status";
import { formatCrypto } from "@/lib/format-crypto";
import { Deposit } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { expireStale } from "@/lib/services/deposits";
import { syncDeposit } from "@/lib/services/payment-events";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Payment" };

type D = {
  _id: string;
  reference: string;
  asset: string;
  network: string;
  address: string;
  memo?: string;
  amountCents: number;
  cryptoAmount?: number;
  rate?: number;
  provider?: string;
  status:
    "awaiting" | "pending" | "approved" | "rejected" | "expired" | "cancelled";
  createdAt: string;
  expiresAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reason?: string;
  txRef?: string;
};

/** Wallet-friendly payment URIs for coins that define one. Everything else gets the plain address. */
function paymentUri(d: D) {
  const amt = d.cryptoAmount ? `?amount=${d.cryptoAmount}` : "";
  if (d.asset === "BTC" && d.network === "Bitcoin")
    return `bitcoin:${d.address}${amt}`;
  if (d.asset === "LTC") return `litecoin:${d.address}${amt}`;
  return d.address;
}

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  await connectDb();
  await expireStale(user.id);
  // Ask the payment provider for the latest, so the page is right even before a callback arrives.
  await syncDeposit(id).catch(() => {});
  const doc = await Deposit.findOne({ _id: id, userId: user.id })
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const d = plain(doc) as D;
  const open = d.status === "awaiting";
  const expired = d.status === "expired";
  const showPay = open || expired;
  const qr = showPay
    ? await QRCode.toDataURL(paymentUri(d), {
        margin: 1,
        width: 240,
        color: { dark: "#0a1230", light: "#ffffff" },
      })
    : null;
  const sendAmount = d.cryptoAmount
    ? formatCrypto(d.asset, d.cryptoAmount)
    : null;

  return (
    <>
      <Link
        href="/dashboard/deposit"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm print:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All payments
      </Link>
      {(open || d.status === "pending") && (
        <LiveRefresh seconds={open ? 20 : 8} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinLogo symbol={d.asset} className="size-11" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Deposit {formatUsd(d.amountCents)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {d.reference} ·{" "}
              <span className="tabular-nums">
                {formatDateTime(d.createdAt)}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {open && d.expiresAt && <PaymentCountdown expiresAt={d.expiresAt} />}
          <StatusBadge
            status={d.status}
            label={depositLabel(d.status, d.provider)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {showPay && (
            <Panel
              title={
                open
                  ? `Send ${sendAmount ?? "your payment"}`
                  : "This payment window has closed"
              }
              description={
                open
                  ? `Send exactly this amount to the address below on the ${d.network} network. Open your wallet, scan the code or copy the details.`
                  : "If you already sent funds, enter your transaction ID below and our team will find them. Otherwise start a new payment."
              }
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
                <div className="mx-auto space-y-2 sm:mx-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr!}
                    alt={`QR code for the ${d.asset} address`}
                    width={200}
                    height={200}
                    className="size-[200px] rounded-xl border bg-white p-1"
                  />
                  <p className="text-muted-foreground text-center text-xs">
                    Scan with your wallet
                  </p>
                </div>
                <div className="space-y-3">
                  {sendAmount && (
                    <CopyField
                      label="Amount to send"
                      value={sendAmount.replace(` ${d.asset}`, "")}
                      emphasis
                    />
                  )}
                  <CopyField
                    label={`${d.asset} address`}
                    value={d.address}
                    mono
                  />
                  {d.memo && (
                    <div className="space-y-2">
                      <CopyField
                        label="Memo / tag (required)"
                        value={d.memo}
                        mono
                      />
                      <p className="text-gold-foreground text-xs">
                        Include this memo or tag with your payment, otherwise it
                        cannot be matched to you.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <NetworkLogo network={d.network} className="size-4" />
                    <span className="text-muted-foreground">Network:</span>
                    <span className="font-medium">{d.network}</span>
                  </div>
                </div>
              </div>

              <p className="border-gold/50 bg-gold/10 flex gap-2 rounded-lg border p-3 text-xs">
                <AlertTriangle
                  className="text-gold-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Only send {d.asset} on the <strong>{d.network}</strong>{" "}
                  network. Funds sent on a different network, to a different
                  address or without a required memo may be lost and cannot be
                  recovered. Network fees are paid by you.
                </span>
              </p>
            </Panel>
          )}

          {showPay && d.provider && (
            <Panel>
              <div className="flex items-start gap-3">
                <Clock
                  className="text-brand mt-0.5 size-6 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="font-semibold">
                    We detect your payment automatically
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    There is nothing to submit. As soon as your transfer is seen
                    on the network, this page shows it and credits your balance
                    after it is confirmed. You can close this page and come
                    back.
                    {expired
                      ? " If you already sent funds after the window closed, we will still find and credit them."
                      : ""}
                  </p>
                </div>
              </div>
              {open && (
                <ConfirmAction
                  trigger={
                    <Button variant="ghost" size="sm" className="self-start">
                      Cancel payment
                    </Button>
                  }
                  title="Cancel this payment?"
                  description="Only cancel if you have not sent any funds. You can start a new payment any time."
                  confirmLabel="Cancel payment"
                  action={cancelDepositAction}
                  fields={{ id: d._id }}
                />
              )}
            </Panel>
          )}

          {showPay && !d.provider && (
            <Panel
              title="Sent it?"
              description="Tell us once the transaction is on its way. Our team then verifies it on the blockchain and credits your balance, usually within the hour."
            >
              <SubmitPayment id={d._id} expired={expired} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                {expired ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/deposit?new=1">
                      Start a new payment
                    </Link>
                  </Button>
                ) : (
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="sm">
                        Cancel payment
                      </Button>
                    }
                    title="Cancel this payment?"
                    description="Only cancel if you have not sent any funds. You can start a new payment any time."
                    confirmLabel="Cancel payment"
                    action={cancelDepositAction}
                    fields={{ id: d._id }}
                  />
                )}
              </div>
            </Panel>
          )}

          {d.status === "pending" && (
            <Panel>
              <div className="flex items-start gap-3">
                <Clock
                  className="text-brand mt-0.5 size-6 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="font-semibold">
                    {d.provider
                      ? "Your payment was detected"
                      : "We are verifying your payment"}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {d.provider
                      ? "We are waiting for the network to confirm it. This usually takes a few minutes. This page updates by itself, and we will email you and notify you in the app as soon as it is credited."
                      : "Our team is checking the transaction. This usually takes about an hour, and sometimes longer. This page updates by itself, and we will email you and notify you in the app as soon as it is credited."}
                  </p>
                  {d.txRef && (
                    <p className="text-muted-foreground font-mono text-xs break-all">
                      Transaction: {d.txRef}
                    </p>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {d.status === "approved" && (
            <Panel>
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="text-success mt-0.5 size-7 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">Payment confirmed</h2>
                  <p className="text-muted-foreground text-sm">
                    {formatUsd(d.amountCents)} was credited to your available
                    balance
                    {d.reviewedAt ? ` on ${formatDateTime(d.reviewedAt)}` : ""}.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 print:hidden">
                <Button asChild size="sm">
                  <Link href="/dashboard/investments">Start investing</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/transactions">View transactions</Link>
                </Button>
                <PrintButton kind="deposit" id={d._id} />
              </div>
            </Panel>
          )}

          {d.status === "rejected" && (
            <Panel>
              <div className="flex items-start gap-3">
                <XCircle
                  className="text-destructive-foreground mt-0.5 size-7 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    We could not confirm this payment
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {d.reason ||
                      "We were not able to match the transaction to this payment."}{" "}
                    If you believe this is a mistake, contact support and quote{" "}
                    {d.reference}.
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="self-start"
              >
                <Link href="/dashboard/support">Contact support</Link>
              </Button>
            </Panel>
          )}

          {d.status === "cancelled" && (
            <Panel>
              <p className="text-muted-foreground text-sm">
                This payment was cancelled. Nothing was charged.
              </p>
              <Button asChild size="sm" className="self-start">
                <Link href="/dashboard/deposit?new=1">Start a new payment</Link>
              </Button>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Summary">
            <dl className="divide-y text-sm">
              {[
                ["Reference", d.reference],
                ["Deposit amount", formatUsd(d.amountCents)],
                ["You send", sendAmount ?? "-"],
                [
                  "Rate",
                  d.rate
                    ? `1 ${d.asset} = ${formatUsd(Math.round(d.rate * 100))}`
                    : "-",
                ],
                ["Network", d.network],
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
            <PaymentTimeline
              status={d.status}
              createdAt={d.createdAt}
              submittedAt={d.submittedAt}
              reviewedAt={d.reviewedAt}
              auto={Boolean(d.provider)}
            />
          </Panel>
          <p className="text-muted-foreground flex gap-2 text-xs print:hidden">
            <ShieldCheck
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            We never ask for your wallet password or recovery phrase. Only ever
            send to the address shown on this page.
          </p>
        </div>
      </div>
    </>
  );
}
