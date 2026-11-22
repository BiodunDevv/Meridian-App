import type { Metadata } from "next";
import Link from "next/link";

import { syncOrderNowAction } from "@/app/actions/reconcile";
import { SubmitButton } from "@/components/app/form";
import { ToastForm } from "@/components/app/toast-form";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Order } from "@/lib/models";
import { formatDateTime, formatMinor } from "@/lib/money";
import { ORDER_LABEL } from "@/lib/order-status";
import { getPayment, paymentsConfigured } from "@/lib/payments/nowpayments";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Reconciliation" };
export const dynamic = "force-dynamic";

type O = {
  _id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  createdAt: string;
  reviewReason?: string;
  payment?: {
    paymentId?: string;
    providerStatus?: string;
    payAsset?: string;
    overpaidBy?: number;
  };
  refund?: {
    type?: string;
    amountMinor?: number;
    reason?: string;
    at?: string;
  };
};

/** What our order status should be, given the payment provider's status. Anything else is a mismatch. */
const EXPECTED: Record<string, string[]> = {
  waiting: ["awaiting_payment", "expired", "cancelled"],
  confirming: ["awaiting_payment", "paid", "expired", "cancelled"],
  confirmed: ["awaiting_payment", "paid", "expired", "cancelled"],
  sending: ["awaiting_payment", "paid", "expired", "cancelled"],
  finished: ["paid", "fulfilling", "delivered", "failed", "refunded", "review"],
  partially_paid: ["review", "refunded"],
  failed: ["expired", "awaiting_payment", "cancelled"],
  expired: ["expired", "cancelled"],
  refunded: ["review", "refunded", "expired"],
};

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  await requireAdmin();
  const run = (await searchParams).run === "1";
  await connectDb();
  // eslint-disable-next-line react-hooks/purity -- evaluated per request
  const since = new Date(Date.now() - 3 * 86_400_000);
  const recent = plain(
    await Order.find({
      "payment.paymentId": { $exists: true },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(40)
      .lean(),
  ) as unknown as O[];

  // The provider check only runs when asked, because it calls the payment provider once per order.
  const mismatches: { o: O; provider: string; why: string }[] = [];
  let checked = 0;
  let unreachable = 0;
  if (run && paymentsConfigured()) {
    for (const o of recent) {
      try {
        const p = await getPayment(o.payment!.paymentId!);
        checked++;
        const ok = (EXPECTED[p.payment_status] ?? []).includes(o.status);
        if (!ok)
          mismatches.push({
            o,
            provider: p.payment_status,
            why: `The provider says "${p.payment_status}" but the order is "${ORDER_LABEL[o.status] ?? o.status}".`,
          });
      } catch {
        unreachable++;
      }
    }
  }
  const [queue, overpaid, refunds] = await Promise.all([
    Order.find({ status: "review", reviewReason: /Underpaid|does not match/i })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .then((r) => plain(r) as unknown as O[]),
    Order.find({ "payment.overpaidBy": { $gt: 0 } })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean()
      .then((r) => plain(r) as unknown as O[]),
    Order.find({ "refund.at": { $exists: true } })
      .sort({ "refund.at": -1 })
      .limit(50)
      .lean()
      .then((r) => plain(r) as unknown as O[]),
  ]);

  const list = (rows: O[], extra: (o: O) => React.ReactNode) =>
    rows.length === 0 ? (
      <EmptyState title="Nothing here" body="All clear." />
    ) : (
      <ul className="divide-y text-sm">
        {rows.map((o) => (
          <li
            key={o._id}
            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <span>
              <Link
                href={`/admin/orders/${o._id}`}
                className="text-brand font-mono text-xs underline-offset-4 hover:underline"
              >
                {o.number}
              </Link>{" "}
              <StatusBadge
                status={o.status}
                label={ORDER_LABEL[o.status] ?? o.status}
              />
              <span className="text-muted-foreground block text-xs">
                {extra(o)}
              </span>
            </span>
            <span className="tabular-nums">
              {formatMinor(o.amountMinor, o.currency)}
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Checks that our orders and the payment provider agree, and lists the money that needs a decision."
        action={
          paymentsConfigured() ? (
            <Button asChild variant="outline">
              <Link href="/admin/reconciliation?run=1">
                Check the last 3 days with the provider
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Panel
        title="Payment status differences"
        description={
          run
            ? `${checked} checked${unreachable ? `, ${unreachable} could not be reached` : ""}.`
            : "Press the button above to compare recent orders with the provider. It asks the provider once per order."
        }
      >
        {!paymentsConfigured() ? (
          <EmptyState
            title="Online payments are not configured"
            body="Set the NOWPayments keys to compare."
          />
        ) : !run ? (
          <p className="text-muted-foreground text-sm">Not run yet.</p>
        ) : mismatches.length === 0 ? (
          <EmptyState
            title="No differences"
            body="Every recent order matches its payment."
          />
        ) : (
          <ul className="divide-y text-sm">
            {mismatches.map(({ o, why }) => (
              <li
                key={o._id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span>
                  <Link
                    href={`/admin/orders/${o._id}`}
                    className="text-brand font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {o.number}
                  </Link>
                  <span className="text-muted-foreground block text-xs">
                    {why}
                  </span>
                </span>
                <ToastForm action={syncOrderNowAction}>
                  <input type="hidden" name="id" value={o._id} />
                  <SubmitButton size="sm" variant="outline" pending="Syncing…">
                    Sync now
                  </SubmitButton>
                </ToastForm>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel
        title="Underpaid and mismatched payments"
        description="These orders are held. Decide: ask for the difference, retry, or refund."
      >
        {list(queue, (o) => o.reviewReason ?? "")}
      </Panel>
      <Panel
        title="Overpaid"
        description="The customer sent more than quoted. The order was delivered; the difference needs a person."
      >
        {list(
          overpaid,
          (o) =>
            `Over by ${o.payment?.overpaidBy} ${o.payment?.payAsset ?? ""}`,
        )}
      </Panel>
      <Panel title="Refunds out" description="Every refund, newest first.">
        {list(
          refunds,
          (o) =>
            `${o.refund?.type === "crypto" ? "Crypto" : "Store credit"} refund ${o.refund?.at ? formatDateTime(o.refund.at) : ""} · ${o.refund?.reason ?? ""}`,
        )}
      </Panel>
    </>
  );
}
