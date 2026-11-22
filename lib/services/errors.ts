import { rateLimit } from "../auth/rate-limit";
import { log, scrub } from "../log";
import { alertAdmins } from "./notify";

/**
 * Logs a failure and tells the admins by email, at most once an hour for the same place, so a broken thing is noticed
 * without a flood. Never throws, and never puts a secret in the log or the email.
 */
export async function reportError(
  scope: string,
  err: unknown,
  fields: Record<string, unknown> = {},
) {
  log.error(`[${scope}] failed`, err, fields);
  try {
    if (!(await rateLimit(`errAlert:${scope}`, 1, 3600))) return;
    await alertAdmins(
      `Something failed: ${scope}`,
      [
        ["Where", scope],
        ["Error", scrub(err instanceof Error ? err.message : String(err))],
      ],
      "/admin",
    );
  } catch {
    /* an alert must never cause a second failure */
  }
}
