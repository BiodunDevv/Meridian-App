import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import QRCode from "qrcode";

import { cancelOrderAction } from "@/app/actions/orders";
import { CoinLogo, NetworkLogo } from "@/components/app/coin-logo";
import { CopyField } from "@/components/app/copy-field";
import { DeliveryReveal } from "@/components/app/delivery-reveal";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PaymentCountdown } from "@/components/app/payment-countdown";
import { ConfirmAction } from "@/components/app/toast-form";
import { Panel, StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { formatCrypto } from "@/lib/format-crypto";
import { Order, OrderEvent, Product } from "@/lib/models";
import { formatDateTime, formatMinor } from "@/lib/money";
import { orderLabel } from "@/lib/order-status";
import { reportError } from "@/lib/services/errors";
import { fulfilOrder, pollFulfilment } from "@/lib/services/fulfilment";
import { syncOrderPayment } from "@/lib/services/order-payments";
import { expireStaleOrders } from "@/lib/services/orders";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Order" };

type O = {
  _id: string;
  number: string;
  status: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  amountUsdCents: number;
  createdAt: string;
  inputs?: Record<string, string>;
  snapshot?: {
    productName?: string;
    optionLabel?: string;
    fxNgnPerUsd?: number;
  };
  payment?: {
    address?: string;
    memo?: string;
    payAsset?: string;
    payNetwork?: string;
    payAmount?: number;
    expiresAt?: string;
    paidAt?: string;
    providerStatus?: string;
  };
  fulfilment?: { deliveredAt?: string };
  delivery?: { encryptedPayload?: string };
};

/** Hides the middle of a phone, meter or card number so a shared screen does not reveal it. */
const mask = (v: string) =>
  v.length <= 6
    ? v
    : `${v.slice(0, 3)}${"•".repeat(v.length - 6)}${v.slice(-3)}`;

function paymentUri(o: O) {
  const p = o.payment!;
  const amt = p.payAmount ? `?amount=${p.payAmount}` : "";
  if (p.payAsset === "BTC" && p.payNetwork === "Bitcoin")
    return `bitcoin:${p.address}${amt}`;
  if (p.payAsset === "LTC") return `litecoin:${p.address}${amt}`;
  return p.address ?? "";
}

const hasDeliveryGuard = (o: O) =>
  o.status === "delivered" && Boolean(o.delivery?.encryptedPayload);

const MESSAGE: Record<
  string,
  { icon: typeof Clock; title: string; body: string }
> = {
  paid: {
    icon: Clock,
    title: "Payment received",
    body: "We are placing your order with our provider. Delivery time depends on the item and the provider. This page updates by itself.",
  },
  fulfilling: {
    icon: Clock,
    title: "Placing your order",
    body: "Your order has been sent to our provider. We do not promise a delivery time. This page updates by itself.",
  },
  review: {
    icon: AlertTriangle,
    title: "We are checking your order",
    body: "Our team needs to look at this order before going on. You do not need to pay again. Open a support ticket if you have questions and quote the order number.",
  },
  delivered: {
    icon: CheckCircle2,
    title: "Delivered",
    body: "Your order was delivered.",
  },
  failed: {
    icon: XCircle,
    title: "We could not deliver this order",
    body: "Your payment is being refunded as store credit. We will let you know when it is done.",
  },
  refunded: {
    icon: CheckCircle2,
    title: "Refunded",
    body: "This order was refunded.",
  },
  expired: {
    icon: XCircle,
    title: "This order expired",
    body: "The payment window closed. If you already sent a payment, it is being checked by our team and you do not need to pay again.",
  },
  cancelled: {
    icon: XCircle,
    title: "Cancelled",
    body: "This order was cancelled before payment.",
  },
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  await connectDb();
  await expireStaleOrders(user.id);
  // Ask the payment provider for the latest, so the page is right even before a callback arrives.
  const synced = await syncOrderPayment(id).catch(() => undefined);
  if (synced === "paid")
    after(() =>
      fulfilOrder(id).catch((e) => reportError("fulfil.order_page", e)),
    );
  const doc = await Order.findOne({ _id: id, userId: user.id })
    .lean()
    .catch(() => null);
  if (!doc) notFound();
  const o = plain(doc) as unknown as O;
  // Safety nets that never block the page: place a paid order nobody picked up, and ask the provider about a sent one.
  if (o.status === "paid")
    after(() =>
      fulfilOrder(id).catch((e) => reportError("fulfil.order_page", e)),
    );
  if (o.status === "fulfilling") after(() => pollFulfilment(id));
  const snapKey = (
    doc as { snapshot?: { providerKey?: string; providerCode?: string } }
  ).snapshot;
  const viewOnce = hasDeliveryGuard(o)
    ? (
        await Product.findOne({
          providerKey: snapKey?.providerKey,
          providerCode: snapKey?.providerCode,
        })
          .select("viewOnce")
          .lean()
      )?.viewOnce
    : false;
  const hasDelivery =
    o.status === "delivered" && Boolean(o.delivery?.encryptedPayload);
  const events = plain(
    await OrderEvent.find({ orderId: id }).sort({ at: 1 }).lean(),
  ) as unknown as {
    _id: string;
    at: string;
    message?: string;
    type: string;
  }[];
  const p = o.payment ?? {};
  const awaiting = o.status === "awaiting_payment";
  const inFlight =
    awaiting &&
    p.providerStatus &&
    !["waiting", "new"].includes(p.providerStatus);
  const qr =
    awaiting && p.address
      ? await QRCode.toDataURL(paymentUri(o), {
          margin: 1,
          width: 240,
          color: { dark: "#0a1230", light: "#ffffff" },
        })
      : null;
  const sendAmount =
    p.payAmount && p.payAsset ? formatCrypto(p.payAsset, p.payAmount) : null;
  const note = MESSAGE[o.status];
  const live = awaiting || ["paid", "fulfilling"].includes(o.status);

  return (
    <>
      <Link
        href="/dashboard/orders"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm print:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All orders
      </Link>
      <div className="print:hidden">
        <Link
          href={`/dashboard/support?order=${o._id}`}
          className="text-brand text-sm underline-offset-4 hover:underline"
        >
          Get help with this order
        </Link>
      </div>
      {live && <LiveRefresh seconds={awaiting ? 15 : 8} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {o.snapshot?.productName}
          </h1>
          <p className="text-muted-foreground text-sm">
            {o.number} · {o.snapshot?.optionLabel} ·{" "}
            <span className="tabular-nums">{formatDateTime(o.createdAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {awaiting && p.expiresAt && !inFlight && (
            <PaymentCountdown expiresAt={p.expiresAt} />
          )}
          <StatusBadge
            status={o.status}
            label={inFlight ? "Confirming payment" : orderLabel(o.status)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {awaiting && qr && (
            <Panel
              title={
                inFlight
                  ? "Your payment is being confirmed"
                  : `Send ${sendAmount ?? "your payment"}`
              }
              description={
                inFlight
                  ? "We can see your payment on the network. It needs a few confirmations. You do not need to do anything."
                  : `Send exactly this amount to the address below on the ${p.payNetwork} network. Open your wallet, scan the code or copy the details.`
              }
            >
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
                <div className="mx-auto space-y-2 sm:mx-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt={`QR code for the ${p.payAsset} address`}
                    width={200}
                    height={200}
                    className="size-[200px] rounded-xl border bg-white p-1"
                  />
                  <p className="text-muted-foreground text-center text-xs">
                    Scan with your wallet
                  </p>
                </div>
                <div className="space-y-3">
                  {sendAmount && p.payAsset && (
                    <CopyField
                      label="Amount to send"
                      value={sendAmount.replace(` ${p.payAsset}`, "")}
                      emphasis
                    />
                  )}
                  <CopyField
                    label={`${p.payAsset} address`}
                    value={p.address ?? ""}
                    mono
                  />
                  {p.memo && (
                    <div className="space-y-2">
                      <CopyField
                        label="Memo / tag (required)"
                        value={p.memo}
                        mono
                      />
                      <p className="text-gold-foreground text-xs">
                        Include this memo or tag, otherwise the payment cannot
                        be matched to your order.
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    {p.payAsset && (
                      <CoinLogo symbol={p.payAsset} className="size-4" />
                    )}
                    <NetworkLogo
                      network={p.payNetwork ?? ""}
                      className="size-4"
                    />
                    <span className="text-muted-foreground">Network:</span>
                    <span className="font-medium">{p.payNetwork}</span>
                  </div>
                </div>
              </div>
              <p className="border-gold/50 bg-gold/10 flex gap-2 rounded-lg border p-3 text-xs">
                <AlertTriangle
                  className="text-gold-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Send only {p.payAsset} on the {p.payNetwork} network, and the
                  full amount. Crypto payments are final once confirmed. A
                  smaller amount puts your order on hold for review.
                </span>
              </p>
              {!inFlight && (
                <div className="print:hidden">
                  <ConfirmAction
                    trigger={
                      <Button variant="outline" size="sm">
                        Cancel order
                      </Button>
                    }
                    title="Cancel this order?"
                    description="Only cancel if you have not sent a payment. If you send funds after cancelling, our team will have to review them."
                    confirmLabel="Cancel order"
                    action={cancelOrderAction}
                    fields={{ id: o._id }}
                  />
                </div>
              )}
            </Panel>
          )}
          {hasDelivery && (
            <Panel
              title="Your details"
              description="The code or token for this order."
            >
              <DeliveryReveal orderId={o._id} viewOnce={Boolean(viewOnce)} />
            </Panel>
          )}
          {note && !awaiting && (
            <Panel>
              <div className="flex items-start gap-3">
                <note.icon
                  className="text-brand mt-0.5 size-5 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">{note.title}</h2>
                  <p className="text-muted-foreground text-sm">{note.body}</p>
                </div>
              </div>
              {["expired", "cancelled"].includes(o.status) && (
                <div className="print:hidden">
                  <Button asChild size="sm">
                    <Link href="/dashboard/shop">Shop again</Link>
                  </Button>
                </div>
              )}
              {[
                "paid",
                "fulfilling",
                "delivered",
                "failed",
                "refunded",
              ].includes(o.status) && (
                <div className="print:hidden">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/receipt/order/${o._id}`}>Receipt</Link>
                  </Button>
                </div>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-semibold tabular-nums">
                  {formatMinor(o.amountMinor, o.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">In US dollars</dt>
                <dd className="tabular-nums">
                  {formatMinor(o.amountUsdCents, "USD")}
                </dd>
              </div>
              {Object.entries(o.inputs ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground capitalize">
                    {k.replace(/([A-Z])/g, " $1")}
                  </dt>
                  <dd className="font-mono text-xs">{mask(String(v))}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground text-xs">
              Priced in {o.currency}. The crypto amount was quoted when you
              started the payment.
            </p>
          </Panel>
          <Panel title="Timeline">
            <ol className="space-y-3 text-sm">
              {events
                .filter(
                  (e) =>
                    e.type !== "note" &&
                    !e.type.startsWith("admin.") &&
                    e.type !== "delivery.revealed",
                )
                .map((e) => (
                  <li key={e._id}>
                    <p>{e.message ?? e.type}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {formatDateTime(e.at)}
                    </p>
                  </li>
                ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
