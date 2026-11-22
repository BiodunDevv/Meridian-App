import { connectDb } from "../db";
import { getEnv, isDbConfigured } from "../env";
import { log } from "../log";
import { EmailLog, User } from "../models";

export interface EmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Free label for the log, e.g. "deposit_approved". */
  kind?: string;
  userId?: string;
  /** Contains a one-time token (verify, reset): the body is not stored and the email is never retried. */
  sensitive?: boolean;
}

type Delivery =
  | { ok: true; messageId?: string }
  | { ok: false; error: string; retryable: boolean };

const BACKOFF_MIN = [5, 30, 120, 360, 1440];
export const MAX_ATTEMPTS = 6;
const LOG_TTL_DAYS = 60;

/** One call to the Brevo transactional API. */
async function deliver(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<Delivery> {
  const env = getEnv();
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    return { ok: false, error: "Brevo is not configured", retryable: false };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: env.BREVO_SENDER_NAME, email: env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      log.error("[email] Brevo error", res.status, body);
      // 4xx (except 408/429) will not succeed on retry. 5xx, 429 and timeouts will.
      const retryable =
        res.status >= 500 || res.status === 429 || res.status === 408;
      return {
        ok: false,
        error: `Brevo ${res.status}: ${body.slice(0, 300)}`,
        retryable,
      };
    }
    const json = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: json.messageId?.replace(/[<>]/g, "") };
  } catch (e) {
    // Network errors and timeouts: worth retrying.
    return {
      ok: false,
      error: e instanceof Error ? e.message : "send failed",
      retryable: true,
    };
  }
}

const nextAttempt = (attempts: number) =>
  new Date(
    Date.now() +
      BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000,
  );

/**
 * Sends a transactional email through Brevo and records it. Never throws: a failed
 * email must not break an account or money action. Failures are queued for retry.
 */
export async function sendEmail(input: EmailInput) {
  const { to, subject, html, text, kind, userId, sensitive } = input;
  const to_ = to.trim().toLowerCase();
  const canLog = isDbConfigured();

  try {
    // Do not send to addresses that hard-bounced or complained.
    if (canLog) {
      await connectDb();
      const blocked = await User.findOne({
        email: to_,
        "emailSuppressed.reason": { $exists: true },
      })
        .select("_id")
        .lean();
      if (blocked) {
        await EmailLog.create({
          to: to_,
          subject,
          kind,
          userId,
          sensitive,
          status: "suppressed",
          lastError: "Address is suppressed (bounce or complaint)",
          expiresAt: expiry(),
        });
        return { ok: false as const, error: "Address is suppressed" };
      }
    }

    const r = await deliver(to_, subject, html, text);

    if (canLog) {
      const base = {
        to: to_,
        subject,
        kind,
        userId,
        sensitive: Boolean(sensitive),
        expiresAt: expiry(),
      };
      const body = sensitive ? {} : { html, text };
      if (r.ok) {
        await EmailLog.create({
          ...base,
          status: "sent",
          attempts: 1,
          messageId: r.messageId,
        });
      } else if (r.error === "Brevo is not configured") {
        // Nothing to retry until configured.
      } else {
        const retry = r.retryable && !sensitive;
        await EmailLog.create({
          ...base,
          ...body,
          status: retry ? "failed" : "dead",
          attempts: 1,
          lastError: r.error,
          nextAttemptAt: retry ? nextAttempt(1) : undefined,
        });
      }
    }
    return r.ok
      ? { ok: true as const }
      : { ok: false as const, error: r.error };
  } catch (e) {
    log.error("[email] send failed", e);
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "send failed",
    };
  }
}

const expiry = () => new Date(Date.now() + LOG_TTL_DAYS * 86_400_000);

/** Retries one logged email. Returns true if it went out. */
async function retryOne(id: string) {
  const log = await EmailLog.findById(id);
  if (
    !log ||
    log.sensitive ||
    !log.html ||
    !["failed", "dead"].includes(log.status)
  )
    return false;
  const r = await deliver(log.to, log.subject, log.html, log.text);
  log.attempts += 1;
  if (r.ok) {
    log.status = "sent";
    log.messageId = r.messageId;
    log.lastError = undefined;
    log.nextAttemptAt = undefined;
  } else {
    log.lastError = r.error;
    if (r.retryable && log.attempts < MAX_ATTEMPTS) {
      log.status = "failed";
      log.nextAttemptAt = nextAttempt(log.attempts);
    } else {
      log.status = "dead";
      log.nextAttemptAt = undefined;
    }
  }
  await log.save();
  return r.ok;
}

/** Retries every failed email that is due. Run by the cron route. */
export async function retryDueEmails(limit = 25) {
  await connectDb();
  const due = await EmailLog.find({
    status: "failed",
    sensitive: false,
    nextAttemptAt: { $lte: new Date() },
  })
    .sort({ nextAttemptAt: 1 })
    .limit(limit)
    .select("_id")
    .lean();
  let sent = 0;
  for (const d of due) if (await retryOne(String(d._id))) sent++;
  return { due: due.length, sent };
}

/** Manual retry from the admin email log, ignoring the schedule. */
export async function retryEmailNow(id: string) {
  await connectDb();
  return retryOne(id);
}
