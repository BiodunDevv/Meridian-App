import type { Metadata } from "next";

import { MessageComposer } from "@/components/app/message-composer";
import { PageHeader } from "@/components/app/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { MessageTemplate } from "@/lib/models";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "New message" };

export default async function NewMessagePage() {
  await requireAdmin();
  await connectDb();
  const rows = plain(
    await MessageTemplate.find().sort({ createdAt: -1 }).limit(50).lean(),
  ) as { _id: string; name: string; subject: string; body: string }[];
  return (
    <>
      <PageHeader
        title="New message"
        description="Choose who gets it, write or pick a template, and check the preview before you send."
      />
      <MessageComposer
        customTemplates={rows.map((t) => ({
          id: t._id,
          name: t.name,
          subject: t.subject,
          body: t.body,
        }))}
      />
    </>
  );
}
