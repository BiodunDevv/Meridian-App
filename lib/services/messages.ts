import { Types } from "mongoose";

import { connectDb } from "../db";
import { sendEmail } from "../email/brevo";
import { emails } from "../email/templates";
import { Deposit, Kyc, Message, Notification, User } from "../models";
import { type AudienceKey, audienceLabel, AUDIENCES } from "./audiences";
import { audit } from "./notify";
import { sendPush } from "./push";

export const MAX_RECIPIENTS = 2000;

export { type AudienceKey, audienceLabel, AUDIENCES };

export interface Recipient {
  _id: Types.ObjectId;
  email: string;
  name?: string;
  username?: string;
}

/** Fills {{firstName}}, {{username}}, {{email}} for one recipient. */
export function fillVars(
  text: string,
  r: { email: string; name?: string; username?: string },
) {
  const first = (r.name || "").trim().split(/\s+/)[0] || r.username || "there";
  return text
    .replace(/\{\{\s*firstName\s*\}\}/g, first)
    .replace(/\{\{\s*username\s*\}\}/g, r.username || first)
    .replace(/\{\{\s*email\s*\}\}/g, r.email);
}

/** Active, verified investors matching the audience. */
export async function resolveAudience(
  type: AudienceKey,
  userIds: string[] = [],
): Promise<Recipient[]> {
  await connectDb();
  const filter: Record<string, unknown> = {
    role: "investor",
    status: "active",
    emailVerifiedAt: { $exists: true },
  };
  const ids = async (p: Promise<unknown[]>) => (await p) as Types.ObjectId[];

  switch (type) {
    case "kyc_approved":
      filter._id = {
        $in: await ids(Kyc.distinct("userId", { status: "approved" })),
      };
      break;
    case "kyc_pending":
      filter._id = {
        $in: await ids(Kyc.distinct("userId", { status: "pending" })),
      };
      break;
    case "kyc_none":
      filter._id = {
        $nin: await ids(
          Kyc.distinct("userId", { status: { $in: ["approved", "pending"] } }),
        ),
      };
      break;
    case "funded":
      filter._id = {
        $in: await ids(Deposit.distinct("userId", { status: "approved" })),
      };
      break;
    case "unfunded":
      filter._id = {
        $nin: await ids(Deposit.distinct("userId", { status: "approved" })),
      };
      break;
    case "no_mfa":
      filter["mfa.enabled"] = { $ne: true };
      break;
    case "selected":
      filter._id = { $in: userIds.filter((i) => Types.ObjectId.isValid(i)) };
      break;
  }
  return (await User.find(filter)
    .select("email name username")
    .limit(MAX_RECIPIENTS + 1)
    .lean()) as unknown as Recipient[];
}

export async function searchUsers(q: string) {
  await connectDb();
  const term = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (term.length < 2) return [];
  const rx = new RegExp(term, "i");
  const rows = await User.find({
    role: "investor",
    status: "active",
    $or: [{ email: rx }, { username: rx }, { name: rx }],
  })
    .select("email username name")
    .limit(8)
    .lean();
  return rows.map((u) => ({
    id: String(u._id),
    email: u.email as string,
    username: (u.username as string) ?? "",
  }));
}

export interface SendInput {
  subject: string;
  body: string;
  audience: AudienceKey;
  userIds: string[];
  channels: { email: boolean; inApp: boolean };
  cta?: { label: string; url: string };
  templateKey?: string;
}

const plainPreview = (s: string) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

/** Sends to every recipient, records the message, and logs it. Emails go out in small parallel batches. */
export async function sendMessage(
  admin: { id: string; email: string },
  input: SendInput,
) {
  const recipients = await resolveAudience(input.audience, input.userIds);
  if (recipients.length === 0) throw new Error("No one matches this audience.");
  if (recipients.length > MAX_RECIPIENTS)
    throw new Error(
      `This audience is larger than ${MAX_RECIPIENTS} people. Narrow it down.`,
    );

  let emailSent = 0;
  let emailFailed = 0;

  if (input.channels.inApp) {
    await Notification.insertMany(
      recipients.map((r) => ({
        userId: r._id,
        title: fillVars(input.subject, r),
        body: plainPreview(fillVars(input.body, r)),
        href: input.cta?.url?.startsWith("/") ? input.cta.url : undefined,
      })),
      { ordered: false },
    );
  }

  if (input.channels.inApp) {
    await sendPush(
      recipients.map((r) => String(r._id)),
      {
        title: input.subject,
        body: plainPreview(input.body),
        url: input.cta?.url?.startsWith("/")
          ? input.cta.url
          : "/dashboard/notifications",
      },
    );
  }

  if (input.channels.email) {
    const BATCH = 8;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((r) =>
          sendEmail({
            to: r.email,
            ...emails.adminMessage(
              fillVars(input.subject, r),
              fillVars(input.body, r),
              input.cta,
            ),
          }),
        ),
      );
      for (const res of results) res.ok ? emailSent++ : emailFailed++;
    }
  }

  const msg = await Message.create({
    subject: input.subject,
    body: input.body,
    templateKey: input.templateKey,
    channels: input.channels,
    audience: {
      type: input.audience,
      label: audienceLabel(input.audience),
      userIds:
        input.audience === "selected" ? recipients.map((r) => r._id) : [],
    },
    cta: input.cta,
    recipientCount: recipients.length,
    emailSent,
    emailFailed,
    inAppCount: input.channels.inApp ? recipients.length : 0,
    sampleRecipients: recipients.slice(0, 12).map((r) => r.email),
    createdBy: admin.id,
    createdByEmail: admin.email,
  });
  await audit(admin, "message.send", String(msg._id), {
    audience: input.audience,
    recipients: recipients.length,
    emailSent,
    emailFailed,
  });
  return {
    id: String(msg._id),
    recipients: recipients.length,
    emailSent,
    emailFailed,
  };
}
