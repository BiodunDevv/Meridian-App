import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderAdminActions } from "@/components/app/order-admin-actions";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui";
import { requireStaff } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { connectDb } from "@/lib/db";
import { Asset, Order, OrderEvent, Ticket, User } from "@/lib/models";
import { formatDateTime, formatMinor } from "@/lib/money";
import { ORDER_LABEL } from "@/lib/order-status";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Order" };

type O = Record<string, any>;

const row = (k: string, v: React.ReactNode) => (
  <div className="flex justify-between gap-3 text-sm" key={k}>
    <dt className="text-muted-foreground">{k}</dt>
    <dd className="text-right font-medium break-all">{v}</dd>
  </div>
);

export default async function AdminOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireStaff("orders.view");
  const { id } = await params;
  await connectDb();
  const doc = await Order.findById(id)
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const o = plain(doc) as O;
  const [user, events, assets, tickets] = await Promise.all([
    User.findById(o.userId).select("email username").lean(),
    OrderEvent.find({ orderId: id })
      .sort({ at: 1 })
      .lean()
      .then((r) => plain(r) as O[]),
    Asset.find({ active: true })
      .select("symbol networks.name networks.active")
      .lean(),
    Ticket.find({ orderId: id }).select("subject status").lean(),
  ]);
  const coins = (
    assets as {
      symbol: string;
      networks: { name: string; active: boolean }[];
    }[]
  )
    .map((a) => ({
      symbol: a.symbol,
      networks: a.networks.filter((n) => n.active).map((n) => n.name),
    }))
    .filter((c) => c.networks.length);
  const seeCost = can(me.role, "orders.view_cost");
  const s = o.snapshot ?? {};
  const p = o.payment ?? {};
  return (
    <>
      <Link
        href="/admin/orders"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All orders
      </Link>
      <PageHeader
        title={`${o.number}: ${s.productName ?? ""}`}
        description={`${s.optionLabel ?? ""} · ${formatDateTime(o.createdAt)}`}
        action={
          <StatusBadge
            status={o.status}
            label={ORDER_LABEL[o.status] ?? o.status}
          />
        }
      />
      {o.reviewReason && (
        <p
          role="alert"
          className="border-gold/50 bg-gold/10 rounded-xl border px-4 py-3 text-sm"
        >
          Review reason: {o.reviewReason}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Customer and inputs">
          <dl className="space-y-2">
            {row(
              "Customer",
              user ? (
                <Link
                  className="text-brand underline-offset-4 hover:underline"
                  href={`/admin/users/${o.userId}`}
                >
                  {user.email as string}
                </Link>
              ) : (
                "Unknown"
              ),
            )}
            {Object.entries(o.inputs ?? {}).map(([k, v]) => row(k, String(v)))}
          </dl>
        </Panel>
        <Panel title="Price breakdown">
          <dl className="space-y-2">
            {row("Customer price", formatMinor(o.amountMinor, o.currency))}
            {row("In US dollars", formatMinor(o.amountUsdCents, "USD"))}
            {seeCost &&
              row(
                "Our cost",
                s.costMinor ? formatMinor(s.costMinor, o.currency) : "-",
              )}
            {seeCost &&
              row(
                "Margin",
                s.marginMinor !== undefined
                  ? formatMinor(s.marginMinor, o.currency)
                  : "-",
              )}
            {seeCost && row("Markup from", s.markupSource ?? "-")}
            {row(
              "Exchange rate",
              s.fxNgnPerUsd ? `NGN ${s.fxNgnPerUsd} per USD` : "-",
            )}
            {row(
              "Provider",
              `${s.providerKey ?? ""} · ${s.providerCode ?? ""}`,
            )}
          </dl>
        </Panel>
        <Panel title="Payment">
          <dl className="space-y-2">
            {row("Coin", p.payAsset ? `${p.payAsset} on ${p.payNetwork}` : "-")}
            {row("Quoted amount", p.payAmount ?? "-")}
            {row("Received", p.actuallyPaid ?? "-")}
            {row("Provider status", p.providerStatus ?? "-")}
            {row("Payment id", p.paymentId ?? "-")}
            {row(
              "Window ends",
              p.expiresAt ? formatDateTime(p.expiresAt) : "-",
            )}
            {row("Paid at", p.paidAt ? formatDateTime(p.paidAt) : "-")}
          </dl>
        </Panel>
      </div>
      <Panel
        title="Actions"
        description="Every action is recorded in the audit log with your name."
      >
        <OrderAdminActions
          id={o._id}
          status={o.status}
          role={me.role}
          hasDelivery={Boolean(o.delivery?.encryptedPayload)}
          coins={coins}
        />
      </Panel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Fulfilment">
          <dl className="space-y-2">
            {row("Provider request id", o.fulfilment?.requestId ?? "-")}
            {row("Attempts", o.fulfilment?.attempts ?? 0)}
            {row("Provider status", o.fulfilment?.providerStatus ?? "-")}
            {row("Provider reference", o.fulfilment?.providerRef ?? "-")}
            {row(
              "Sent to provider",
              o.fulfilment?.purchaseSentAt
                ? formatDateTime(o.fulfilment.purchaseSentAt)
                : "Not yet",
            )}
            {row(
              "Next check",
              o.fulfilment?.nextAttemptAt
                ? formatDateTime(o.fulfilment.nextAttemptAt)
                : "-",
            )}
            {row("Last problem", o.fulfilment?.lastError ?? "-")}
            {row(
              "Delivered",
              o.fulfilment?.deliveredAt
                ? formatDateTime(o.fulfilment.deliveredAt)
                : "-",
            )}
          </dl>
        </Panel>
        <Panel title="Support tickets for this order">
          {tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No tickets are linked to this order.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(
                tickets as unknown as {
                  _id: string;
                  subject: string;
                  status: string;
                }[]
              ).map((t) => (
                <li key={String(t._id)}>
                  <Link
                    href={`/admin/support/${t._id}`}
                    className="text-brand underline-offset-4 hover:underline"
                  >
                    {t.subject}
                  </Link>{" "}
                  <span className="text-muted-foreground">· {t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel title="Timeline">
        <ol className="space-y-3 text-sm">
          {events.map((e) => (
            <li key={e._id}>
              <p>
                <span className="font-medium">{e.type}</span>{" "}
                {e.message ? `· ${e.message}` : ""}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatDateTime(e.at)} · {e.actor}
                {e.from ? ` · ${e.from} to ${e.to}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
