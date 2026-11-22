import * as webpush from "web-push";

import { connectDb } from "../db";
import { getEnv } from "../env";
import { log } from "../log";
import { PushSubscription } from "../models";

export interface PushPayload {
  title: string;
  body?: string;
  /** In-app path to open on tap. */
  url?: string;
}

let configured: boolean | null = null;
function configure() {
  if (configured !== null) return configured;
  const env = getEnv();
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
    return (configured = false);
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  return (configured = true);
}

/**
 * Sends a web push to every device the given users enabled. Dead subscriptions (404/410) are removed.
 * Never throws: push is a nice-to-have on top of the in-app notification and email.
 */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!userIds.length || !configure()) return { sent: 0 };
  try {
    await connectDb();
    const subs = await PushSubscription.find({
      userId: { $in: userIds },
    }).lean();
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? "",
      url: payload.url ?? "/dashboard",
    });
    let sent = 0;
    const BATCH = 20;
    for (let i = 0; i < subs.length; i += BATCH) {
      await Promise.all(
        subs.slice(i, i + BATCH).map(async (s) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: s.endpoint as string,
                keys: { p256dh: s.p256dh as string, auth: s.auth as string },
              },
              body,
              { TTL: 60 * 60 * 24, urgency: "normal" },
            );
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410)
              await PushSubscription.deleteOne({ _id: s._id });
            else log.error("[push] failed", code ?? e);
          }
        }),
      );
    }
    return { sent };
  } catch (e) {
    log.error("[push] error", e);
    return { sent: 0 };
  }
}
