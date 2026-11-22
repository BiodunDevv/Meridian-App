import { notFound, redirect } from "next/navigation";

import { ReceiptSheet, ReceiptToolbar } from "@/components/app/receipt";
import { disclaimers } from "@/content/site";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { formatCrypto } from "@/lib/format-crypto";
import { Order } from "@/lib/models";
import { formatDateTime, formatMinor } from "@/lib/money";
import { orderLabel } from "@/lib/order-status";
import { plain } from "@/lib/services/queries";

export const metadata = { title: "Order receipt" };

type O = {
  _id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  amountUsdCents: number;
  createdAt: string;
  snapshot?: {
    productName?: string;
    optionLabel?: string;
    fxNgnPerUsd?: number;
  };
  payment?: {
    payAsset?: string;
    payNetwork?: string;
    payAmount?: number;
    paymentId?: string;
    address?: string;
    paidAt?: string;
  };
};

export default async function OrderReceipt({
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
  const doc = await Order.findOne({ _id: id, userId: user.id })
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const o = plain(doc) as unknown as O;
  // A receipt only exists for money that was actually received.
  if (!o.payment?.paidAt) redirect(`/dashboard/orders/${id}`);
  const p = o.payment;
  const refs: [string, string, boolean][] = [];
  if (p.paymentId) refs.push(["Payment ID", p.paymentId, true]);
  if (p.address) refs.push(["Paid to address", p.address, true]);

  return (
    <main className="min-h-svh bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <ReceiptToolbar
        backHref={`/dashboard/orders/${id}`}
        autoPrint={sp.print === "1"}
      />
      <ReceiptSheet
        title="Order receipt"
        number={o.number}
        issued={formatDateTime(new Date())}
        headline="Price of this order"
        amount={formatMinor(o.amountMinor, o.currency)}
        status={orderLabel(o.status)}
        statusDate={p.paidAt ? `Paid ${formatDateTime(p.paidAt)}` : undefined}
        account={[
          ["Name", user.name || "Not provided"],
          ["Username", user.username ? `@${user.username}` : "Not set"],
          ["Email", user.email],
        ]}
        details={[
          ["Order", o.number],
          [
            "Item",
            `${o.snapshot?.productName ?? ""}${o.snapshot?.optionLabel ? `, ${o.snapshot.optionLabel}` : ""}`,
          ],
          ["Placed", formatDateTime(o.createdAt)],
          ["Price", formatMinor(o.amountMinor, o.currency)],
          ["Price in US dollars", formatMinor(o.amountUsdCents, "USD")],
          ...(o.snapshot?.fxNgnPerUsd
            ? ([
                ["Exchange rate used", `NGN ${o.snapshot.fxNgnPerUsd} per USD`],
              ] as [string, string][])
            : []),
          ...(p.payAsset
            ? ([["Paid with", `${p.payAsset} on ${p.payNetwork}`]] as [
                string,
                string,
              ][])
            : []),
          ...(p.payAmount && p.payAsset
            ? ([["Crypto amount", formatCrypto(p.payAsset, p.payAmount)]] as [
                string,
                string,
              ][])
            : []),
          ["Fee charged by Meridian", "None beyond the price shown"],
        ]}
        references={refs}
        note="This receipt confirms that the payment above was received for this order. Network fees paid when sending are not included. A receipt is not proof of delivery; see the order page for its status."
        site={getEnv().NEXT_PUBLIC_SITE_URL.replace(/^https?:\/\//, "")}
        risk={disclaimers.footerRisk}
      />
    </main>
  );
}
