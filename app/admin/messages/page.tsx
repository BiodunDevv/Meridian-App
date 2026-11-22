import { Bell, Mail, MessageSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Message } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Messages" };

type Row = {
  _id: string;
  subject: string;
  body: string;
  createdAt: string;
  createdByEmail?: string;
  audience: { label: string };
  channels: { email: boolean; inApp: boolean };
  recipientCount: number;
  emailSent: number;
  emailFailed: number;
  sampleRecipients: string[];
};

export default async function MessagesPage() {
  await requireAdmin();
  await connectDb();
  const rows = plain(
    await Message.find().sort({ createdAt: -1 }).limit(100).lean(),
  ) as Row[];
  return (
    <>
      <PageHeader
        title="Messages"
        description="Send announcements and personal messages to your users by email and in-app notification."
        action={
          <Button asChild>
            <Link href="/admin/messages/new">
              <Plus /> New message
            </Link>
          </Button>
        }
      />
      <Panel title="Sent messages">
        {rows.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages sent yet"
            body="Start from a ready-made template, choose who should receive it, and preview the email before you send."
            action={
              <Button asChild size="sm">
                <Link href="/admin/messages/new">Write your first message</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((m) => (
              <li key={m._id}>
                <details className="group py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.subject}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(m.createdAt)} · {m.audience.label} · by{" "}
                        {m.createdByEmail}
                      </p>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-3 text-xs">
                      <span className="bg-secondary rounded-full px-2 py-0.5">
                        {m.recipientCount} recipients
                      </span>
                      {m.channels.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3.5" aria-hidden="true" />{" "}
                          {m.emailSent}
                          {m.emailFailed > 0 && (
                            <span className="text-destructive-foreground">
                              {" "}
                              ({m.emailFailed} failed)
                            </span>
                          )}
                        </span>
                      )}
                      {m.channels.inApp && (
                        <span className="inline-flex items-center gap-1">
                          <Bell className="size-3.5" aria-hidden="true" />{" "}
                          in-app
                        </span>
                      )}
                    </div>
                  </summary>
                  <div className="bg-muted/40 mt-3 space-y-2 rounded-lg p-3 text-sm">
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.sampleRecipients.length > 0 && (
                      <p className="text-muted-foreground text-xs">
                        To: {m.sampleRecipients.join(", ")}
                        {m.recipientCount > m.sampleRecipients.length &&
                          ` and ${m.recipientCount - m.sampleRecipients.length} more`}
                      </p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
