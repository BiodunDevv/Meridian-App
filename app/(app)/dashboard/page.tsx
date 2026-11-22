import { ShoppingBag, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  Checklist,
  EmptyState,
  LEDGER_LABEL,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/app/ui";
import { PayForTiles } from "@/components/shop/pay-for-tiles";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Order } from "@/lib/models";
import { formatDate, formatMinor, formatUsd } from "@/lib/money";
import { orderLabel } from "@/lib/order-status";
import { customerOverview } from "@/lib/services/queries";
import { kycStatus } from "@/lib/services/withdrawals";

export const metadata: Metadata = { title: "Overview" };

export default async function Overview() {
  const user = await requireUser();
  await connectDb();
  const [o, kyc, recentOrders, openOrders] = await Promise.all([
    customerOverview(user.id),
    kycStatus(user.id),
    Order.find({ userId: user.id }).sort({ createdAt: -1 }).limit(5).lean(),
    Order.countDocuments({
      userId: user.id,
      status: { $in: ["awaiting_payment", "paid", "fulfilling", "review"] },
    }),
  ]);
  const orders = JSON.parse(JSON.stringify(recentOrders)) as {
    _id: string;
    number: string;
    status: string;
    amountMinor: number;
    currency: "NGN" | "USD";
    createdAt: string;
    snapshot?: { productName?: string };
  }[];
  const first = (user.name || user.email).split(/[ @]/)[0];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${first}`}
        description="Your orders and store credit at a glance."
        action={
          <Button asChild>
            <Link href="/dashboard/shop">
              <ShoppingBag /> Shop
            </Link>
          </Button>
        }
      />
      <section aria-labelledby="pay-for" className="space-y-3">
        <h2 id="pay-for" className="text-sm font-semibold">
          What do you want to pay for?
        </h2>
        <PayForTiles />
      </section>
      {kyc !== "approved" && (
        <div className="border-gold/50 bg-gold/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
          <span>
            {kyc === "pending"
              ? "Your identity verification is under review."
              : "Verify your identity to raise your limits."}
          </span>
          {kyc !== "pending" && (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/settings">Verify identity</Link>
            </Button>
          )}
        </div>
      )}
      <Checklist
        title="Get started"
        description="Quick steps to secure your account."
        steps={[
          {
            label: "Verify your identity",
            hint: "Needed for higher limits.",
            done: kyc === "approved" || kyc === "pending",
            href: "/dashboard/settings",
            cta: "Verify",
          },
          {
            label: "Turn on two-step login",
            hint: "Add an authenticator app for extra protection.",
            done: user.mfaEnabled,
            href: "/dashboard/settings",
            cta: "Set up",
          },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Store credit"
          value={formatUsd(o.available)}
          icon={Wallet}
          hint="From refunds"
        />
        <StatCard
          label="Open orders"
          value={String(openOrders)}
          icon={ShoppingBag}
        />
      </div>
      <Panel title="Recent orders">
        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            body="Choose airtime, data, electricity or cable TV."
          />
        ) : (
          <ul className="divide-y">
            {orders.map((r) => (
              <li key={r._id}>
                <Link
                  href={`/dashboard/orders/${r._id}`}
                  className="hover:bg-accent/40 flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span>
                    <span className="block font-medium">
                      {r.snapshot?.productName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {r.number} · {formatDate(r.createdAt)} ·{" "}
                      {orderLabel(r.status)}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMinor(r.amountMinor, r.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href="/dashboard/orders">View all orders</Link>
        </Button>
      </Panel>
      <Panel title="Store credit activity">
        {o.recent.length === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Make a deposit to get started."
          />
        ) : (
          <ul className="divide-y">
            {o.recent.map(
              (e: {
                _id: string;
                type: string;
                amountCents: number;
                createdAt: string;
              }) => (
                <li
                  key={e._id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <span>
                    <span className="block font-medium">
                      {LEDGER_LABEL[e.type] ?? e.type}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(e.createdAt)}
                    </span>
                  </span>
                  <span
                    className={
                      e.amountCents >= 0
                        ? "text-success font-semibold tabular-nums"
                        : "font-semibold tabular-nums"
                    }
                  >
                    {e.amountCents >= 0 ? "+" : ""}
                    {formatUsd(e.amountCents)}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href="/dashboard/transactions">View all transactions</Link>
        </Button>
      </Panel>
      {o.pendingDeposits > 0 && (
        <p className="text-muted-foreground text-sm">
          {o.pendingDeposits} deposit{o.pendingDeposits > 1 ? "s" : ""} awaiting
          confirmation. We target confirmation within about an hour.
        </p>
      )}
    </>
  );
}
