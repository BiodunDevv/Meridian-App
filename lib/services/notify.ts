import { connectDb } from "../db";
import { sendEmail } from "../email/brevo";
import { emails } from "../email/templates";
import { getEnv } from "../env";
import { log } from "../log";
import { AuditLog, Notification, User } from "../models";
import { sendPush } from "./push";

/** In-app notification, plus an optional email. Never throws. */
export async function notify(
  userId: string,
  n: { title: string; body?: string; href?: string },
  email?: { subject: string; html: string; text?: string },
) {
  try {
    await connectDb();
    await Notification.create({ userId, ...n });
    await sendPush([userId], { title: n.title, body: n.body, url: n.href });
    if (email) {
      const u = await User.findById(userId).select("email");
      if (u) await sendEmail({ to: u.email, ...email });
    }
  } catch (e) {
    log.error("[notify] failed", e);
  }
}

/** Emails every active admin about new work to review. Never throws. */
export async function alertAdmins(
  title: string,
  rows: [string, string][],
  path: string,
) {
  try {
    await connectDb();
    const admins = await User.find({ role: "admin", status: "active" })
      .select("email")
      .limit(10)
      .lean();
    const mail = emails.adminAlert(title, rows, path);
    await Promise.all(
      admins.map((a) => sendEmail({ to: a.email as string, ...mail })),
    );
  } catch (e) {
    log.error("[alertAdmins] failed", e);
  }
}

/** Sends a ready-made email to every active admin (plus ADMIN_EMAIL if it is not already one). */
export async function mailAdmins(mail: {
  subject: string;
  html: string;
  text: string;
}) {
  try {
    await connectDb();
    const admins = await User.find({ role: "admin", status: "active" })
      .select("email")
      .limit(10)
      .lean();
    const to = new Set(admins.map((a) => (a.email as string).toLowerCase()));
    const extra = getEnv().ADMIN_EMAIL.trim().toLowerCase();
    if (extra) to.add(extra);
    await Promise.all(
      [...to].map((email) => sendEmail({ to: email, ...mail })),
    );
  } catch (e) {
    log.error("[mailAdmins] failed", e);
  }
}

export async function audit(
  actor: { id: string; email: string } | null,
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
) {
  try {
    await connectDb();
    await AuditLog.create({
      ...(actor ? { actorId: actor.id } : {}),
      actorEmail: actor ? actor.email : "system (automatic)",
      action,
      target,
      meta,
    });
  } catch (e) {
    log.error("[audit] failed", e);
  }
}
