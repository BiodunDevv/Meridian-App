import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  LifeBuoy,
  ShieldCheck,
  ShoppingBag,
  Users,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, Panel, StatCard } from "@/components/app/ui";
import { requireStaff } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, formatMinor, formatUsd } from "@/lib/money";
import { adminOverview } from "@/lib/services/queries";
import {
  needsAttention,
  type Period,
  periodStats,
} from "@/lib/services/reports";

export const metadata: Metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

function Stats({
  title,
  p,
  money,
}: {
  title: string;
  p: Period;
  money: boolean;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Orders placed"
          value={String(p.orders)}
          icon={ShoppingBag}
        />
        <StatCard label="Delivered" value={String(p.delivered)} />
        <StatCard
          label="Failed or refunded"
          value={String(p.failed)}
          tone={p.failed ? "gold" : undefined}
        />
        <StatCard
          label="Average delivery"
          value={
            p.avgDeliveryMin === null ? "None yet" : `${p.avgDeliveryMin} min`
          }
          hint="From payment to delivery"
        />
        {money && (
          <>
            <StatCard
              label="Revenue (delivered)"
              value={formatUsd(p.revenue)}
              tone="positive"
            />
            <StatCard label="Cost" value={formatUsd(p.cost)} />
            <StatCard
              label="Gross margin"
              value={formatUsd(p.margin)}
              tone={p.margin > 0 ? "positive" : undefined}
            />
            <StatCard
              label="Refunded"
              value={formatUsd(p.refundedAmount)}
              hint={`${p.refunded} order${p.refunded === 1 ? "" : "s"}`}
            />
          </>
        )}
      </div>
      {money && (
        <p className="text-muted-foreground text-xs">
          Crypto received for orders: {formatUsd(p.cryptoReceived)}. Revenue
          counts delivered orders only; cost comes from the price snapshot taken
          when each order was placed.
        </p>
      )}
    </section>
  );
}

export default async function AdminOverview() {
  const me = await requireStaff();
  const money = can(me.role, "orders.view_cost");
  // eslint-disable-next-line react-hooks/purity -- server component, evaluated per request
  const now = Date.now();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [today, month, attn, o] = await Promise.all([
    periodStats(startOfDay, new Date(now)),
    periodStats(new Date(now - 30 * 86_400_000), new Date(now)),
    needsAttention(),
    money ? adminOverview() : null,
  ]);
  const items = [
    {
      href: "/admin/orders?status=review",
      label: "Orders in review",
      n: attn.review,
      icon: AlertTriangle,
    },
    {
      href: "/admin/orders?status=failed",
      label: "Failed orders",
      n: attn.failed,
      icon: AlertTriangle,
    },
    {
      href: "/admin/orders?status=review&q=Underpaid",
      label: "Underpaid payments",
      n: attn.underpaid,
      icon: Wallet,
    },
    {
      href: "/admin/support",
      label: "Tickets waiting for us",
      n: attn.openTickets,
      icon: LifeBuoy,
    },
  ];
  const queues = o
    ? [
        {
          href: "/admin/deposits",
          label: "Pending deposits",
          n: o.pendDep,
          icon: ArrowDownToLine,
        },
        {
          href: "/admin/withdrawals",
          label: "Pending withdrawals",
          n: o.pendWd,
          icon: ArrowUpFromLine,
        },
        {
          href: "/admin/users",
          label: "Identity checks to review",
          n: o.pendKyc,
          icon: ShieldCheck,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Overview"
        description="How the business is doing, and what needs a person."
      />

      <Panel title="Needs attention" description="Clear these first.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...items, ...queues].map((q) => (
            <Link
              key={q.label}
              href={q.href}
              className="bg-card hover:border-brand/50 flex items-center justify-between rounded-xl border p-4 transition-colors"
            >
              <div>
                <p className="text-muted-foreground text-xs">{q.label}</p>
                <p className="text-2xl font-semibold tabular-nums">{q.n}</p>
              </div>
              <q.icon
                className={
                  q.n
                    ? "text-gold-foreground size-5"
                    : "text-muted-foreground size-5"
                }
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
        {attn.lowFloat.length > 0 && (
          <p
            role="alert"
            className="border-gold/50 bg-gold/10 mt-3 rounded-lg border px-3 py-2 text-sm"
          >
            Low float: {attn.lowFloat.map((p) => p.name).join(", ")}.{" "}
            {money && (
              <Link href="/admin/providers" className="underline">
                Open providers
              </Link>
            )}
          </p>
        )}
        <p className="text-muted-foreground mt-3 text-xs">
          {attn.awaiting} awaiting payment, {attn.inFlight} being fulfilled.
        </p>
      </Panel>

      <Stats title="Today" p={today} money={money} />
      <Stats title="Last 30 days" p={month} money={money} />

      {money && (
        <Panel
          title="Provider float"
          description="Money prefunded with each provider. Orders fail when it runs out."
        >
          {attn.providers.length === 0 ? (
            <EmptyState title="No providers yet" body="Add one in Providers." />
          ) : (
            <ul className="divide-y text-sm">
              {attn.providers.map((p) => (
                <li
                  key={p.key}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums">
                    {p.balance === undefined
                      ? "Not checked yet"
                      : formatMinor(p.balance, p.currency)}
                    {p.low ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · alert below {formatMinor(p.low, p.currency)}
                      </span>
                    ) : null}
                    {p.checkedAt ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatDateTime(p.checkedAt)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {o && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Total users"
              value={String(o.users)}
              icon={Users}
            />
            <StatCard label="Verified users" value={String(o.verified)} />
          </div>
          <Panel title="Recent admin activity">
            {o.recentAudit.length === 0 ? (
              <EmptyState
                title="No admin activity yet"
                body="Every admin action is logged here."
              />
            ) : (
              <ul className="divide-y text-sm">
                {o.recentAudit.map(
                  (a: {
                    _id: string;
                    action: string;
                    actorEmail?: string;
                    createdAt: string;
                  }) => (
                    <li
                      key={a._id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <span>
                        <span className="font-medium">{a.action}</span>{" "}
                        <span className="text-muted-foreground">
                          by {a.actorEmail}
                        </span>
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(a.createdAt)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
