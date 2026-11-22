import { LifeBuoy, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LiveRefresh } from "@/components/app/live-refresh";
import { NewTicketDialog } from "@/components/app/new-ticket";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Order, Ticket } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { plain } from "@/lib/services/queries";
import { ticketRef } from "@/lib/services/support";

export const metadata: Metadata = { title: "Support" };

type T = {
  _id: string;
  subject: string;
  status: string;
  category: string;
  lastMessageAt: string;
  lastMessageBy: string;
  unreadByUser: boolean;
};
const STATUS_LABEL: Record<string, string> = {
  open: "Waiting for us",
  pending: "Replied",
  closed: "Closed",
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const user = await requireUser();
  await connectDb();
  // Opened from an order page: the order must belong to this customer.
  const orderId = (await searchParams).order;
  const linked = orderId
    ? await Order.findOne({ _id: orderId, userId: user.id })
        .select("number")
        .lean()
        .catch(() => null)
    : null;
  const order = linked
    ? { id: String(linked._id), number: linked.number as string }
    : undefined;
  const tickets = plain(
    await Ticket.find({ userId: user.id })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean(),
  ) as T[];
  return (
    <>
      <PageHeader
        title="Support"
        description="Ask a question and we reply here and by email. Your whole conversation stays in one place."
        action={
          <NewTicketDialog
            order={order}
            trigger={
              <Button>
                <Plus /> New request
              </Button>
            }
          />
        }
      />
      <LiveRefresh seconds={15} />
      <Panel>
        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No requests yet"
            body="Questions about a deposit, a withdrawal or your account? Send us a message and we will get back to you."
            action={
              <NewTicketDialog
                trigger={
                  <Button size="sm">
                    <Plus /> Start a request
                  </Button>
                }
              />
            }
          />
        ) : (
          <ul className="divide-y">
            {tickets.map((t) => (
              <li key={t._id}>
                <Link
                  href={`/dashboard/support/${t._id}`}
                  className="hover:bg-accent/40 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {t.unreadByUser && (
                        <span
                          className="bg-gold size-2 shrink-0 rounded-full"
                          aria-label="New reply"
                        />
                      )}
                      <span className="truncate">{t.subject}</span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {ticketRef(t._id)} ·{" "}
                      <span className="capitalize">{t.category}</span> ·{" "}
                      {formatDateTime(t.lastMessageAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs">
                    <StatusBadge
                      status={
                        t.status === "open"
                          ? "pending"
                          : t.status === "pending"
                            ? "approved"
                            : "none"
                      }
                    />
                    <span className="sr-only">{STATUS_LABEL[t.status]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
