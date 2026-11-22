import { MailWarning, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";

import { retryDueEmailsAction, retryEmailAction } from "@/app/actions/admin";
import { IconSubmit, SubmitButton } from "@/components/app/form";
import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import { ToastForm } from "@/components/app/toast-form";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/app/ui";
import { Badge } from "@/components/ui/badge";
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
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { EmailLog } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Email log" };

type Row = {
  _id: string;
  createdAt: string;
  to: string;
  subject: string;
  status: string;
  attempts: number;
  lastError?: string;
  sensitive?: boolean;
  nextAttemptAt?: string;
};

const tone: Record<string, string> = {
  sent: "text-muted-foreground",
  delivered: "border-success/40 text-success bg-success/10",
  failed: "border-gold/50 text-gold-foreground bg-gold/10",
  dead: "border-destructive-foreground/40 text-destructive-foreground bg-destructive-foreground/10",
  bounced:
    "border-destructive-foreground/40 text-destructive-foreground bg-destructive-foreground/10",
  complaint:
    "border-destructive-foreground/40 text-destructive-foreground bg-destructive-foreground/10",
  suppressed: "text-muted-foreground",
};

export default async function EmailLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const params = parseParams(await searchParams);
  await connectDb();
  const [{ rows, total, page, pages, pageSize }, queued, bounced, complaints] =
    await Promise.all([
      queryResource("emails", params),
      EmailLog.countDocuments({ status: "failed" }),
      EmailLog.countDocuments({ status: "bounced" }),
      EmailLog.countDocuments({ status: "complaint" }),
    ]);
  const data = rows as Row[];

  return (
    <>
      <PageHeader
        title="Email log"
        description="Every email the platform sends. Failed sends retry automatically with backoff."
        action={
          <ToastForm action={retryDueEmailsAction}>
            <SubmitButton variant="outline" size="default" pending="Retrying…">
              <RefreshCw /> Retry due now
            </SubmitButton>
          </ToastForm>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Waiting to retry"
          value={String(queued)}
          icon={RotateCcw}
        />
        <StatCard label="Bounced" value={String(bounced)} icon={MailWarning} />
        <StatCard
          label="Spam complaints"
          value={String(complaints)}
          icon={ShieldAlert}
        />
      </div>
      <Panel>
        <TableToolbar
          placeholder="Search recipient or subject"
          dates
          exportResource="emails"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                "sent",
                "delivered",
                "failed",
                "dead",
                "bounced",
                "complaint",
                "suppressed",
              ].map((v) => ({ value: v, label: v })),
            },
          ]}
        />
        {data.length === 0 ? (
          <EmptyState
            title="No emails yet"
            body="Emails appear here as soon as the platform sends one."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tries</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((e) => (
                <TableRow key={e._id}>
                  <TableCell data-label="When">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell data-label="To" className="max-w-44 truncate">
                    {e.to}
                  </TableCell>
                  <TableCell data-label="Subject" className="max-w-56 truncate">
                    {e.subject}
                  </TableCell>
                  <TableCell data-label="Status">
                    <Badge
                      variant="outline"
                      className={cn("capitalize", tone[e.status])}
                    >
                      {e.status}
                    </Badge>
                  </TableCell>
                  <TableCell data-label="Tries">{e.attempts}</TableCell>
                  <TableCell
                    data-label="Detail"
                    className="text-muted-foreground max-w-56 truncate text-xs"
                  >
                    {e.lastError ??
                      (e.status === "failed" && e.nextAttemptAt
                        ? `Next try ${formatDateTime(e.nextAttemptAt)}`
                        : "")}
                  </TableCell>
                  <TableCell data-label="">
                    {["failed", "dead"].includes(e.status) && !e.sensitive && (
                      <ToastForm action={retryEmailAction}>
                        <input type="hidden" name="id" value={e._id} />
                        <IconSubmit label="Retry now">
                          <RefreshCw />
                        </IconSubmit>
                      </ToastForm>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/email-log"
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
