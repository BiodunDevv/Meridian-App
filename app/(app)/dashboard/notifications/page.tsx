import type { Metadata } from "next";

import { markNotificationsReadAction } from "@/app/actions/user";
import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Notification } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  await connectDb();
  const rows = plain(
    await Notification.find({ userId: user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
  );
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates on payments, orders and your account."
        action={
          rows.some((n: { readAt?: string }) => !n.readAt) ? (
            <form action={markNotificationsReadAction}>
              <Button variant="outline" size="sm" type="submit">
                Mark all as read
              </Button>
            </form>
          ) : undefined
        }
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            variant="done"
            title="You are all caught up"
            body="We will let you know when an order is paid, delivered or refunded."
          />
        ) : (
          <ul className="divide-y">
            {rows.map(
              (n: {
                _id: string;
                title: string;
                body?: string;
                createdAt: string;
                readAt?: string;
              }) => (
                <li key={n._id} className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-gold"}`}
                    aria-hidden="true"
                  />
                  <div className="text-sm">
                    <p className="font-medium">{n.title}</p>
                    {n.body && (
                      <p className="text-muted-foreground">{n.body}</p>
                    )}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </Panel>
    </>
  );
}
