import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { adminSetStatusAction } from "@/app/actions/support";
import { AdminReplyBox } from "@/components/app/admin-reply-box";
import { SubmitButton } from "@/components/app/form";
import { LiveRefresh } from "@/components/app/live-refresh";
import { TicketThread } from "@/components/app/ticket-thread";
import { ToastForm } from "@/components/app/toast-form";
import { Panel, StatusBadge } from "@/components/app/ui";
import { requireStaff } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Kyc, Order } from "@/lib/models";
import { User } from "@/lib/models";
import { formatDateTime, formatUsd } from "@/lib/money";
import {
  CANNED_REPLIES,
  getThread,
  markRead,
  ticketRef,
} from "@/lib/services/support";

export const metadata: Metadata = { title: "Conversation" };

export default async function AdminTicket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff("support.reply");
  const { id } = await params;
  const data = await getThread(id, { includeInternal: true });
  if (!data) notFound();
  if (data.ticket.unreadByAdmin) await markRead(id, "admin");
  await connectDb();
  const { ticket, messages, owner } = data;
  const linkedOrder = (ticket as { orderId?: unknown }).orderId
    ? await Order.findById((ticket as { orderId?: unknown }).orderId)
        .select("number")
        .lean()
    : null;
  const [full, kyc] = await Promise.all([
    User.findById(ticket.userId).select("balanceCents status").lean(),
    Kyc.findOne({ userId: ticket.userId }).select("status").lean(),
  ]);

  return (
    <>
      <Link
        href="/admin/support"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All conversations
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {ticket.subject}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {ticketRef(ticket._id)} ·{" "}
            <span className="capitalize">{ticket.category}</span> · opened{" "}
            {formatDateTime(ticket.createdAt)}
            {linkedOrder && (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/admin/orders/${linkedOrder._id}`}
                  className="text-brand underline-offset-4 hover:underline"
                >
                  Order {linkedOrder.number as string}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={
              ticket.status === "open"
                ? "pending"
                : ticket.status === "pending"
                  ? "approved"
                  : "none"
            }
          />
          {(["open", "pending", "closed"] as const)
            .filter((s) => s !== ticket.status)
            .map((s) => (
              <ToastForm key={s} action={adminSetStatusAction}>
                <input type="hidden" name="ticketId" value={id} />
                <input type="hidden" name="status" value={s} />
                <SubmitButton size="sm" variant="outline">
                  {s === "open"
                    ? "Reopen"
                    : s === "pending"
                      ? "Mark replied"
                      : "Close"}
                </SubmitButton>
              </ToastForm>
            ))}
        </div>
      </div>
      <LiveRefresh seconds={8} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <TicketThread messages={messages} viewer="admin" />
          <div className="border-t pt-4">
            <AdminReplyBox ticketId={id} canned={CANNED_REPLIES} />
          </div>
        </Panel>
        <Panel title="Customer" className="lg:self-start">
          {owner ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium break-all">
                  <Link
                    href={`/admin/users/${ticket.userId}`}
                    className="text-brand underline-offset-4 hover:underline"
                  >
                    {owner.email}
                  </Link>
                </dd>
              </div>
              {owner.username && (
                <div>
                  <dt className="text-muted-foreground">Username</dt>
                  <dd>@{owner.username}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-medium tabular-nums">
                  {formatUsd(full?.balanceCents ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Identity</dt>
                <dd className="capitalize">
                  {(kyc?.status as string) ?? "Not submitted"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account</dt>
                <dd className="capitalize">
                  {(full?.status as string) ?? "unknown"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              This user no longer exists.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
