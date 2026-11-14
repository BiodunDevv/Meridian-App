# Meridian landing page

Single-page marketing site for **Meridian**, an investment platform. Built on the Launch UI template (Next.js App Router, React 19, Tailwind CSS v4, shadcn/ui, lucide-react, next-themes, Inter via `next/font`). The palette is electric blue, elegant gold and dark navy. No paid services, no analytics, no external image hosts.

## Install and run

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run seed                 # creates or updates the admin account only (safe, deletes nothing)
npm run reset                # WIPES the database, then recreates admin, plans and assets
npm run dev                  # http://localhost:3000
npm run build && npm run start
npm run lint
npm run test:email -- you@example.com   # sends a Brevo test email
```

## What is in this project

- `/` landing page.
- `/register`, `/login` (with two-step login), `/verify-email`, `/forgot-password`, `/reset-password`.
- `/dashboard/*` investor app: overview, portfolio, investments, deposit, withdraw, transactions, notifications, settings (profile, identity verification, two-step login, password, signed-in devices).
- `/admin/*` admin dashboard: overview, users and KYC review, investments, deposits queue, withdrawals queue, transactions ledger, settings (wallet addresses, plans, audit log).
- Backend: server actions in `app/actions`, business rules in `lib/services`, models in `lib/models.ts`, Brevo email in `lib/email`, `GET /api/cron/accrue`.

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable                                                   | Purpose                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                     | Public URL of the site (canonical URL, emailed links).                                                                                                                     |
| `NEXT_PUBLIC_APP_URL`                                      | Leave empty (the app lives in this project). Set only if the app is on another domain.                                                                                     |
| `MONGODB_URI`                                              | MongoDB connection string. Use Atlas or a replica set so money movements run in transactions. Until it is set, the app builds and shows a "Database not connected" screen. |
| `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`             | Generated secrets. `ENCRYPTION_KEY` must be 32 random bytes, base64 (`openssl rand -base64 32`).                                                                           |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | Transactional email through Brevo. The sender address must be a verified sender in your Brevo account.                                                                     |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`                            | The admin account, created or updated by `npm run seed`.                                                                                                                   |

## How money works

- Amounts are stored in integer cents. Every movement writes a ledger entry with a running balance.
- Deposits: the user sends crypto to an address the admin set, then taps "I have paid". An admin approves (balance credited) or rejects.
- Plans: investing debits the balance. Profit accrues daily on the investment; at maturity the principal and profit are credited. Accrual runs on dashboard loads and on a daily job (`vercel.json` schedules `GET /api/cron/accrue`; other hosts must call it daily with `Authorization: Bearer $CRON_SECRET`).
- Withdrawals: need approved KYC. The amount is held immediately. An admin marks it paid (with a transaction hash) or rejects it (amount refunded).
- Sensitive KYC fields and MFA secrets are encrypted (AES-256-GCM). Passwords are hashed with bcrypt. Sessions are server-side and revocable.

## First run checklist

1. Add `MONGODB_URI`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` to `.env.local`.
2. `npm run seed`, then log in at `/login` as the admin.
3. In Admin > Settings add wallet addresses. Users cannot deposit until at least one is set.
4. `npm run test:email -- you@example.com` to confirm Brevo delivery.

## Rename the brand, edit copy and plans

Landing copy, nav, plans and FAQ live in [`content/site.ts`](content/site.ts). Plans used by the app are stored in the database (edit them in Admin > Settings); `npm run seed` only inserts missing ones.

## Colours and theme

Design tokens are CSS variables in [`app/globals.css`](app/globals.css), in the original Launch UI structure (`--brand`, `--primary`, `--background`, …) plus a `--gold` accent.

- Electric blue: `--brand` / `--primary` (`#2459f2`)
- Gold: `--gold` (`#d4af37`), `--gold-foreground` for text
- Dark navy: dark mode `--background` (`#091129`); light mode foreground is deep navy (`#0a1230`)

Light mode is the default, dark mode is toggled with the sun/moon button (class strategy, no flash on load).

## Structure

```
app/                  layout, page, legal pages, sitemap, robots, OG image
components/sections/  navbar, hero, logos (assets), items (features), how-it-works,
                      dashboards, plans, calculator, security, stats, faq, cta, footer
components/mockups/   investor dashboard preview (React, illustrative data)
components/ui/        shadcn and Launch UI primitives (glow, mockup, layout-lines, …)
content/site.ts       all copy and links
```

## Content rules

Before going live: real deposits, returns and withdrawals need legal review, the right registration for your country of operation and a proper KYC/AML process. Rotate any API key that was ever shared in chat. Returns are always "projected" or "illustrative" and shown beside the risk wording; copy never promises outcomes. The Terms, Privacy and Risk pages are drafts and need legal review and the right registration for your country of operation before launch.

## Resetting to a clean slate

`npm run seed` only creates or updates the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (password reset, made admin, unsuspended, sessions ended). It never deletes data. Add `-- --reset-2fa` if the admin lost their authenticator app. `npm run reset` is the destructive one: it deletes everything in the configured database and recreates the admin, plans and asset catalogue, after asking you to type the database name (`npm run reset -- --yes` skips the prompt). Never run `reset` against a live database you want to keep.

## Support, referrals, push, email reliability

- **Support (two-way):** users open requests at `/dashboard/support`; admins reply, leave internal notes, use canned replies and change status at `/admin/support`. Replies notify by in-app, email and push. Open conversations refresh themselves every few seconds.
- **User detail (admin):** `/admin/users/<id>` shows the profile, ledger, deposits, withdrawals, investments, identity, support tickets, admin notes and activity. Every admin table has search, filters, a date range, pagination and **Export CSV**.
- **Reinvest and top-up:** each active investment can reinvest automatically at maturity (capped at the plan maximum) and can be topped up; a top-up is pro-rated for the days left and matures with the original.
- **Referrals:** users share `/register?ref=CODE`. The reward (default 2% of the friend's first deposit of $100+, capped at $100) is configurable in Admin > Settings and credited once.
- **Web push:** needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generate with `npx web-push generate-vapid-keys`). iOS only supports push for apps added to the Home Screen (iOS 16.4+).
- **Email reliability:** every email is logged (Admin > Email log). Failed sends retry with backoff via `GET /api/cron/emails` (`Authorization: Bearer $CRON_SECRET`, hourly in `vercel.json`). In Brevo > Transactional > Settings > Webhooks, add `https://YOUR-DOMAIN/api/webhooks/brevo?token=$BREVO_WEBHOOK_SECRET` for delivered, hard bounce, soft bounce, blocked, invalid, spam and unsubscribed. Hard bounces and complaints suppress the address. Confirm-email and password-reset emails are never stored or retried.
- **Weak connections:** forms send a one-time key so a retry after a timeout never creates a duplicate deposit, investment, withdrawal or ticket; the app shows an offline banner and pauses save buttons; static assets are cached by the service worker.
- **Plans:** the landing page reads the live plans from the database and refreshes when an admin edits them. `npm run seed:plans` loads the default lineup without touching users.

## Online payments (automatic deposits and withdrawals)

Meridian can run payments end to end through [NOWPayments](https://nowpayments.io). Without the keys below the
app keeps the manual review flow, so nothing breaks.

1. Create a NOWPayments account and get an **API key** and an **IPN secret** (Settings > Payments). Put them in
   `NOWPAYMENTS_API_KEY` and `NOWPAYMENTS_IPN_SECRET`. Use `NOWPAYMENTS_SANDBOX=true` with a sandbox account first.
2. In NOWPayments set the IPN callback URL to `https://YOUR-SITE/api/webhooks/payments` (shown in Admin > Settings).
3. **Deposits:** each deposit gets its own address and amount from the provider. The webhook (and a re-check every
   time the user opens the payment, plus `/api/cron/payments` every 10 minutes) moves it to _Confirming_ and then
   credits the balance once, even if callbacks repeat or arrive late. Underpaid deposits wait for an admin.
4. **Withdrawals:** add `NOWPAYMENTS_EMAIL` and `NOWPAYMENTS_PASSWORD` for the account holding the payout balance, and
   `NOWPAYMENTS_2FA_SECRET` so payouts can be confirmed automatically. A withdrawal is paid automatically only when it
   passes every check: identity verified, per-withdrawal limit, daily limit per user, a smaller limit for a new
   address, no memo-based coin, and a supported network. Everything else is held in the admin queue with the reason.
   A payout the provider fails is **not** refunded automatically; it returns to the queue for a person.
5. Check **Admin > Settings > Online payments** to test the connection and tune the limits. Admin > Payment methods
   shows which networks are automatic, and lets you set a provider currency code when the guess is wrong.

Test everything in the sandbox before using real funds. Check that your provider allows your type of business.
