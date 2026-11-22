import { z } from "zod";

/** A key left as the text "null" or "undefined" (a common paste slip) counts as empty. */
const key = z
  .string()
  .default("")
  .transform((v) => (/^\s*(null|undefined)\s*$/i.test(v) ? "" : v.trim()));

const schema = z.object({
  MONGODB_URI: z.string().default(""),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "ENCRYPTION_KEY must be 32 random bytes, base64 encoded",
    ),
  CRON_SECRET: z.string().min(16),
  BREVO_API_KEY: z.string().default(""),
  BREVO_SENDER_EMAIL: z.string().default(""),
  BREVO_SENDER_NAME: z.string().default("Meridian"),
  NEXT_PUBLIC_SITE_URL: z.string().default("http://localhost:3000"),
  ADMIN_EMAIL: z.string().default(""),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  BREVO_WEBHOOK_SECRET: z.string().default(""),
  ADMIN_PASSWORD: z.string().default(""),
  /** Cloudinary: private storage for identity documents. */
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  /** Online payments (NOWPayments). Leave empty to keep the manual deposit review flow. */
  NOWPAYMENTS_API_KEY: z.string().default(""),
  NOWPAYMENTS_IPN_SECRET: z.string().default(""),
  NOWPAYMENTS_SANDBOX: z.string().default("false"),
  /** Payout (automatic withdrawal) login, and the base32 secret of the account's authenticator app. */
  NOWPAYMENTS_EMAIL: z.string().default(""),
  NOWPAYMENTS_PASSWORD: z.string().default(""),
  NOWPAYMENTS_2FA_SECRET: z.string().default(""),
  /**
   * Fulfilment providers. Sandbox and live keys are separate, so switching a provider to live in the admin
   * needs no code change: add the live keys here first. Never commit these.
   */
  /** One set of keys for whichever mode is selected (optional). The mode-specific names below win if set. */
  VTPASS_API_KEY: key,
  VTPASS_PUBLIC_KEY: key,
  VTPASS_SECRET_KEY: key,
  VTPASS_SANDBOX_API_KEY: key,
  VTPASS_SANDBOX_PUBLIC_KEY: key,
  VTPASS_SANDBOX_SECRET_KEY: key,
  VTPASS_LIVE_API_KEY: key,
  VTPASS_LIVE_PUBLIC_KEY: key,
  VTPASS_LIVE_SECRET_KEY: key,
  /** VTpass has no signature on callbacks, so the callback URL carries this secret. */
  VTPASS_WEBHOOK_SECRET: key,
  AUTO_WITHDRAW_MAX_USD: z.coerce.number().positive().default(500),
  AUTO_WITHDRAW_DAILY_USD: z.coerce.number().positive().default(2000),
  AUTO_WITHDRAW_NEW_ADDRESS_MAX_USD: z.coerce.number().positive().default(100),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated environment, read lazily so builds work without secrets. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${msg}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

export const isDbConfigured = () => Boolean(process.env.MONGODB_URI);
