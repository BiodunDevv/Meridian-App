import { Inbox, LifeBuoy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LiveRefresh } from "@/components/app/live-refresh";
import { MobileDetails } from "@/components/app/mobile-details";
import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/app/ui";
import { UserLink } from "@/components/app/user-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  paramsToQuery,
  parseParams,
  queryResource,
} from "@/lib/admin/resources";
import { requireStaff } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Ticket } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { ticketRef } from "@/lib/services/support";
import { TICKET_CATEGORIES } from "@/lib/services/ticket-categories";

export const metadata: Metadata = { title: "Support" };

type Row = {
  _id: string;
  userId: { _id: string; email: string } | null;
  subject: string;
  category: string;
  status: string;
  messageCount: number;
  lastMessageAt: string;
  lastMessageBy: string;
  unreadByAdmin: boolean;
};

export default async function AdminSupport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff("support.reply");
  const params = parseParams(await searchParams);
  await connectDb();
  const [{ rows, total, page, pages, pageSize }, open, pending, unread] =
    await Promise.all([
      queryResource("tickets", params),
      Ticket.countDocuments({ status: "open" }),
      Ticket.countDocuments({ status: "pending" }),
      Ticket.countDocuments({ unreadByAdmin: true }),
    ]);
  const data = rows as Row[];
  return (
    <>
      <PageHeader
        title="Support"
        description="Conversations with your users. Reply here and they get it by email and in the app."
      />
      <LiveRefresh seconds={15} />
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Waiting for us" value={String(open)} icon={Inbox} />
        <StatCard
          label="Unread"
          value={String(unread)}
          icon={LifeBuoy}
          tone={unread ? "gold" : undefined}
        />
        <StatCard label="Replied" value={String(pending)} />
      </div>
      <Panel>
        <TableToolbar
          placeholder="Search subject or user"
          dates
          exportResource="tickets"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { value: "open", label: "Waiting for us" },
                { value: "pending", label: "Replied" },
                { value: "closed", label: "Closed" },
              ],
            },
            {
              key: "category",
              label: "Topic",
              options: TICKET_CATEGORIES.map((c) => ({
                value: c.value,
                label: c.label,
              })),
            },
          ]}
        />
        {data.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No conversations"
            body="When a user opens a support request it appears here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Request</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Last message</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((t) => (
                <TableRow key={t._id}>
                  <TableCell data-label="Request" className="max-w-64">
                    <Link
                      href={`/admin/support/${t._id}`}
                      className="flex items-center gap-2 font-medium underline-offset-4 hover:underline"
                    >
                      {t.unreadByAdmin && (
                        <span
                          className="bg-gold size-2 shrink-0 rounded-full"
                          aria-label="Unread"
                        />
                      )}
                      <span className="truncate">{t.subject}</span>
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {ticketRef(t._id)}
                    </span>
                  </TableCell>
                  <TableCell data-label="User">
                    <UserLink user={t.userId} />
                  </TableCell>
                  <TableCell data-label="Topic" className="capitalize">
                    {t.category}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge
                      status={
                        t.status === "open"
                          ? "pending"
                          : t.status === "pending"
                            ? "approved"
                            : "none"
                      }
                    />
                  </TableCell>
                  <TableCell data-label="Messages">{t.messageCount}</TableCell>
                  <TableCell data-label="Last message">
                    {formatDateTime(t.lastMessageAt)}
                  </TableCell>
                  <MobileDetails href={`/admin/support/${t._id}`} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/support"
          query={paramsToQuery(params)}
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
        />
      </Panel>
    </>
  );
}
