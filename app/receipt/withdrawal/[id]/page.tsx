import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ReceiptSheet, ReceiptToolbar } from "@/components/app/receipt";
import { disclaimers } from "@/content/site";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formatCrypto } from "@/lib/format-crypto";
import { Withdrawal } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = {
  title: "Withdrawal receipt",
  robots: { index: false },
};

type W = {
  _id: string;
  reference?: string;
  asset: string;
  network: string;
  address: string;
  amountCents: number;
  cryptoAmount?: number;
  txHash?: string;
  status: string;
  createdAt: string;
  reviewedAt?: string;
};

export default async function WithdrawalReceipt({
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
  const doc = await Withdrawal.findOne({ _id: id, userId: user.id })
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const w = plain(doc) as W;
  if (w.status !== "paid") redirect(`/dashboard/withdraw/${id}`);

  const refs: [string, string, boolean][] = [];
  if (w.txHash) refs.push(["Transaction ID", w.txHash, true]);
  refs.push(["Paid to address", w.address, true]);

  return (
    <main className="min-h-svh bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <ReceiptToolbar
        backHref={`/dashboard/withdraw/${id}`}
        autoPrint={sp.print === "1"}
      />
      <ReceiptSheet
        title="Withdrawal receipt"
        number={w.reference ?? w._id}
        issued={formatDateTime(new Date())}
        headline="Amount paid out"
        amount={formatUsd(w.amountCents)}
        status="Paid"
        statusDate={w.reviewedAt ? formatDateTime(w.reviewedAt) : undefined}
        account={[
          ["Name", user.name || "Not provided"],
          ["Username", user.username ? `@${user.username}` : "Not set"],
          ["Email", user.email],
        ]}
        details={[
          ["Reference", w.reference ?? w._id],
          ["Requested", formatDateTime(w.createdAt)],
          ...(w.reviewedAt
            ? ([["Paid", formatDateTime(w.reviewedAt)]] as [string, string][])
            : []),
          ["Paid as", `${w.asset} on ${w.network}`],
          ...(w.cryptoAmount
            ? ([["Amount sent", formatCrypto(w.asset, w.cryptoAmount)]] as [
                string,
                string,
              ][])
            : []),
          ["Amount withdrawn", formatUsd(w.amountCents)],
          ["Fee charged by Meridian", "None"],
        ]}
        references={refs}
        note="This receipt confirms that the withdrawal above was paid out from your Meridian balance to the address shown. Blockchain transfers cannot be reversed."
        site={getEnv().NEXT_PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}
        risk={disclaimers.footerRisk}
      />
    </main>
  );
}
