import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReceiptSheet, ReceiptToolbar } from "@/components/app/receipt";
import { disclaimers } from "@/content/site";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formatCrypto } from "@/lib/format-crypto";
import { Deposit } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = {
  title: "Deposit receipt",
  robots: { index: false },
};

type D = {
  _id: string;
  reference?: string;
  asset: string;
  network: string;
  address?: string;
  amountCents: number;
  creditedCents?: number;
  cryptoAmount?: number;
  rate?: number;
  txRef?: string;
  provider?: string;
  providerPaymentId?: string;
  status: string;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;
};

export default async function DepositReceipt({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  await connectDb();
  const doc = await Deposit.findOne({ _id: id, userId: user.id })
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const d = plain(doc) as D;
  // A receipt only exists for money that was actually credited.
  if (d.status !== "approved") redirect(`/dashboard/deposit/${id}`);

  const credited = d.creditedCents ?? d.amountCents;
  const now = formatDateTime(new Date());
  const refs: [string, string, boolean][] = [];
  if (d.txRef) refs.push(["Transaction ID", d.txRef, true]);
  if (d.providerPaymentId) refs.push(["Payment ID", d.providerPaymentId, true]);
  if (d.address) refs.push(["Paid to address", d.address, true]);

  return (
    <main className="min-h-svh bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <ReceiptToolbar
        backHref={`/dashboard/deposit/${id}`}
        autoPrint={sp.print === "1"}
      />
      <ReceiptSheet
        title="Deposit receipt"
        number={d.reference ?? d._id}
        issued={now}
        headline="Amount credited to your balance"
        amount={formatUsd(credited)}
        status="Credited"
        statusDate={d.reviewedAt ? formatDateTime(d.reviewedAt) : undefined}
        account={[
          ["Name", user.name || "Not provided"],
          ["Username", user.username ? `@${user.username}` : "Not set"],
          ["Email", user.email],
        ]}
        details={[
          ["Reference", d.reference ?? d._id],
          ["Created", formatDateTime(d.createdAt)],
          ...(d.reviewedAt
            ? ([["Confirmed", formatDateTime(d.reviewedAt)]] as [
                string,
                string,
              ][])
            : []),
          ["Method", `${d.asset} on ${d.network}`],
          ...(d.cryptoAmount
            ? ([["Amount sent", formatCrypto(d.asset, d.cryptoAmount)]] as [
                string,
                string,
              ][])
            : []),
          ...(d.rate
            ? ([
                [
                  "Rate",
                  `1 ${d.asset} = ${formatUsd(Math.round(d.rate * 100))}`,
                ],
              ] as [string, string][])
            : []),
          ["Requested amount", formatUsd(d.amountCents)],
          ["Fee charged by Meridian", "None"],
          ["Credited", formatUsd(credited)],
        ]}
        references={refs}
        note="This receipt confirms that the deposit above was received and credited to your Meridian balance. Network fees paid when sending are not included."
        site={getEnv().NEXT_PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}
        risk={disclaimers.footerRisk}
      />
    </main>
  );
}
