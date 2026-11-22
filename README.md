# Meridian

<p align="center">
  <img src="./public/favicon.svg" alt="Meridian logo" width="120" />
</p>

<p align="center">
  <strong>Spend your crypto on everyday bills: airtime, data, electricity and cable TV, paid one order at a time.</strong>
</p>

Meridian is a full-stack Next.js application. A customer chooses an item, pays for that one order in crypto, and
Meridian buys it from a provider (VTpass), delivers it, and keeps a small markup on the price. Behind the storefront
sit identity verification with private document uploads, an exact money ledger, branded email, an installable
mobile app (PWA), and an admin back office that runs the whole business.

> **Status: a working demo running on sandbox money.** Everything in this repository works end to end against test
> environments: the payment processor runs in sandbox mode, the fulfilment provider runs in sandbox mode, and no
> real money moves. It is built to production standards (atomic money handling, idempotent callbacks, audit
> logging, role-based access, tests), but it has **not** been launched. The Terms, Privacy, Refund and Risk pages are
> drafts that need legal review, and a real launch needs the regulatory and provider approvals listed in
> [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md). Gift cards are coming soon and are not on sale.

## What This App Covers

- A public site: landing page, what Meridian sells, how ordering works, honest delivery and refund summaries,
  security, FAQ, and draft legal pages
- Sign-up, sign-in (email or username), email verification, password reset and two-step login (authenticator app and
  recovery codes)
- A customer dashboard: a shop inside the app, orders, store credit, notifications, support and settings
- **Pay-per-order checkout:** every order gets its own crypto payment for an exact amount, with a locked price and
  a short payment window
- **Fulfilment engine:** a paid order is placed with the provider exactly once, then delivered or refunded exactly
  once
- Identity (KYC) verification with private document photo uploads
- An admin back office for orders, catalogue, pricing, providers, reports, reconciliation, customers, support and
  settings, with a limited **staff** role
- Printable receipts, CSV exports, web push notifications and an installable mobile experience

## Core Product Value

- **Money you can trust.** Amounts are integer minor units. Every state change that moves money is an atomic,
  guarded update, so a payment, a purchase or a refund can never happen twice.
- **Never trust the browser or a callback.** Prices are recomputed on the server from the catalogue. Payment and
  provider callbacks are signature-checked and confirmed with the provider before an order changes.
- **Honest copy.** Prices are shown in naira and US dollars, crypto payments are final, and no delivery time is
  promised. There is no invented activity, testimonial or number anywhere.
- **Operable by one person.** The admin overview shows what needs a person, the order page explains exactly what
  happened, and every admin action is written to an audit log.

## Key Features

### Customer Experience

- **Shop:** four categories (airtime, data bundles, electricity, cable TV) with live prices and a validated
  checkout. Inputs such as phone, meter and smartcard numbers are checked on the server, and electricity and cable
  numbers can be verified with the provider before the customer pays.
- **Pay with crypto:** pick a coin and network, get a QR code, an exact amount, copy buttons and a countdown. The page
  updates by itself as the payment confirms.
- **Orders:** a live status timeline for every order, a printable receipt, and a "get help with this order" link
  that opens a support ticket tied to the order.
- **Delivery:** electricity tokens are encrypted at rest, shown only to the owner, audited on every view, and can be
  view-once per product. Codes are never put in email unless a product allows it.
- **Store credit:** if an order cannot be delivered it is refunded to store credit automatically. Store credit and
  refunds appear in a ledger with a running balance.
- **Account:** username prompt, two-step login, signed-in device list, push notifications, installable PWA.
- **Identity:** a step form with a country picker, ID details and photo uploads with compression and preview.
  Verified customers get a higher daily limit.

### Admin and Staff

- **Overview:** today and last 30 days (orders, revenue, cost, gross margin, refunds, failures, average delivery
  time), provider float, and a "needs attention" list.
- **Orders:** filters, search, CSV export, and an order page with the price breakdown, payment, fulfilment, support
  tickets and a full timeline. Actions: retry fulfilment, mark delivered with proof, refund to store credit, refund
  to crypto, cancel, internal note, resend email, and reveal a customer's code (audited).
- **Catalogue and pricing:** categories, products, input fields, denominations, markup per product or category,
  a minimum margin guard, bulk update, and an approve-the-diff sync from the provider.
- **Providers and float:** switch a provider on or off, sandbox or live, low-balance alerts and a top-up log.
- **Reconciliation:** orders compared with the payment provider, underpaid and overpaid queues, and every refund out.
- **Reports:** revenue, cost, margin and refund rate by day, product, category and provider, with CSV export.
- **Customers:** KYC review with an image viewer, per-customer order limit and block, risk flags, notes, sessions,
  activity.
- **Support and messaging:** two-way tickets with canned replies for order cases, templated messages to audiences,
  an email log with retry, and the audit log.
- **Staff role:** handles orders and support only. It cannot change pricing, providers, settings or users, cannot
  refund to crypto, cannot reveal a code, and cannot see cost or margin.

### UX and Platform Quality

- Responsive: tables turn into cards on phones, with a clear details button on every row
- Light and dark themes, and a compact notch header drawn in the opposite theme to the page
- Installable PWA with an offline page, an offline banner, push notifications and an install prompt
- Idempotent form submits so a retry after a weak connection never creates a duplicate order
- Toasts, dialogs, searchable pickers and print-ready receipts

## Order Lifecycle

```text
created -> awaiting_payment -> paid -> fulfilling -> delivered
                |               |          |
                v               v          v
             expired         review     failed -> refunded (credit | crypto)
                          (a person decides)
cancelled (before payment)
```

| Status                  | Meaning                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `created`               | The server validated the inputs and locked the price. No payment yet.                             |
| `awaiting_payment`      | A crypto payment exists with its own address, exact amount and expiry.                            |
| `paid`                  | The payment provider confirmed the full amount.                                                   |
| `fulfilling`            | The purchase is with the fulfilment provider. It can only start once.                             |
| `delivered`             | The provider confirmed. A token, if any, is stored encrypted.                                     |
| `failed`                | The provider definitely refused. The order is refunded to store credit.                           |
| `review`                | Anything the system cannot decide: underpaid, wrong price, late payment, provider trouble, stuck. |
| `refunded`              | Money went back as store credit (or a crypto refund request).                                     |
| `expired` / `cancelled` | The window closed unpaid, or the customer cancelled before paying.                                |

Every transition is an atomic guard (`findOneAndUpdate` on the current state) and writes an order event with who, when
and why. Nothing is ever deleted.

## Money Flow

```text
Customer              Meridian                 NOWPayments            VTpass
   │ 1. choose + inputs  │                          │                    │
   │────────────────────►│ 2. recompute price,      │                    │
   │                     │    limits, KYC gate      │                    │
   │                     │ 3. create payment ──────►│                    │
   │ 4. pay exact crypto │                          │                    │
   │────────────────────────────────────────────────►                    │
   │                     │ 5. signed callback  ◄────│                    │
   │                     │ 6. confirm with provider │                    │
   │                     │ 7. order -> paid (once)  │                    │
   │                     │ 8. claim + send ─────────────────────────────►│
   │                     │ 9. result / status check ◄───────────────────│
   │ 10. delivered, receipt, email                  │                    │
```

1. **Price and lock.** The browser sends only a product and a choice. The server computes
   `price = cost + markup`, rounded up in minor units and never below cost plus the minimum margin, converts it to US
   dollars with the admin's rate, and holds it for the payment window.
2. **One payment per order.** The order number is the payment reference, so any payment can be traced to its order.
3. **Confirm in full.** A `finished` callback is verified by signature, then confirmed again with the payment
   provider. The order moves to `paid` only if the amount received is at least 99% of the quote and the price matches.
   Anything else goes to `review`.
4. **Place once.** The order is claimed with an atomic `paid -> fulfilling` guard and gets one provider request id. A
   one-worker lease and a "sent" marker written before the first send mean a crash is recovered by asking the
   provider, never by buying again.
5. **Deliver or refund once.** Success stores the delivery and notifies the customer. A definite refusal refunds to
   store credit in one database transaction guarded by "no refund recorded yet".

### Pricing and Limits

| Setting                                | Where                       | Default                                               |
| -------------------------------------- | --------------------------- | ----------------------------------------------------- |
| Default markup                         | Admin > Pricing             | 5%                                                    |
| Minimum margin (price floor over cost) | Admin > Pricing             | 1%                                                    |
| Naira per US dollar                    | Admin > Pricing             | Not set. Naira products cannot be ordered without it. |
| Daily limit, email verified only       | Admin > Settings > Ordering | $50                                                   |
| Daily limit, identity verified         | Admin > Settings > Ordering | $500                                                  |
| Orders per day / unpaid orders at once | Admin > Settings > Ordering | 10 / 3                                                |
| Payment window                         | Admin > Settings > Ordering | 30 minutes                                            |
| Ordering open                          | Admin > Settings > Ordering | Closed until an admin opens it                        |

The limits are placeholders until the owner decides them. A per-customer block or limit can override them.

## Tech Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts`), React 19, TypeScript
- Tailwind CSS 4, shadcn/ui, Radix UI, lucide-react, Recharts, Sonner, next-themes, Motion
- MongoDB with Mongoose (transactions on Atlas or a replica set)
- Zod for validation, bcryptjs for passwords, otplib for two-step login, AES-256-GCM for sensitive fields
- Brevo for transactional email
- NOWPayments for crypto payments and payouts
- VTpass for airtime, data, electricity and cable TV (a deterministic mock provider is built in for testing)
- Cloudinary for private identity document storage
- web-push for notifications, qrcode for QR codes

## Environment Variables

Copy `.env.example` to `.env.local`. Only the required block is needed to run the app.

### Required

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/
AUTH_SECRET=generate-with-openssl-rand-base64-48
ENCRYPTION_KEY=generate-with-openssl-rand-base64-32
CRON_SECRET=generate-with-openssl-rand-hex-24
BREVO_API_KEY=your-brevo-key
BREVO_SENDER_EMAIL=verified-sender@example.com
CLOUDINARY_CLOUD_NAME=your-cloud
CLOUDINARY_API_KEY=your-key
CLOUDINARY_API_SECRET=your-secret
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=choose-a-strong-password
```

### Optional

```env
BREVO_SENDER_NAME=Meridian
BREVO_WEBHOOK_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
NEXT_PUBLIC_APP_URL=

# Crypto payments
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_SANDBOX=true
NOWPAYMENTS_EMAIL=
NOWPAYMENTS_PASSWORD=
NOWPAYMENTS_2FA_SECRET=
AUTO_WITHDRAW_MAX_USD=500
AUTO_WITHDRAW_DAILY_USD=2000
AUTO_WITHDRAW_NEW_ADDRESS_MAX_USD=100

# Fulfilment provider (VTpass). Fill ONE set and swap the values when you go live,
# or fill the separate SANDBOX and LIVE sets, which win when present.
VTPASS_API_KEY=
VTPASS_PUBLIC_KEY=
VTPASS_SECRET_KEY=
VTPASS_SANDBOX_API_KEY=
VTPASS_SANDBOX_PUBLIC_KEY=
VTPASS_SANDBOX_SECRET_KEY=
VTPASS_LIVE_API_KEY=
VTPASS_LIVE_PUBLIC_KEY=
VTPASS_LIVE_SECRET_KEY=
VTPASS_WEBHOOK_SECRET=
```

### Variable Guide

| Variable                                        | Purpose                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                          | Public address of the site, used for links in emails, the canonical URL and payment callbacks                                                |
| `NEXT_PUBLIC_APP_URL`                           | Only if the customer app lives on a different domain from the public site                                                                    |
| `MONGODB_URI`                                   | MongoDB connection string. Use Atlas or a replica set so money movements run in transactions                                                 |
| `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`  | Generated secrets. `ENCRYPTION_KEY` must decode to 32 bytes and must be backed up                                                            |
| `BREVO_*`                                       | Transactional email. The sender address must be verified in Brevo. `BREVO_WEBHOOK_SECRET` enables the bounce webhook                         |
| `CLOUDINARY_*`                                  | Private storage for identity photos, stored as authenticated assets with no public URL                                                       |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`                 | The admin account created or updated by `npm run seed`                                                                                       |
| `VAPID_*`                                       | Web push keys (`npx web-push generate-vapid-keys`). Without them push is off                                                                 |
| `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | Turn on crypto payments. Both are required. Use `NOWPAYMENTS_SANDBOX=true` while testing                                                     |
| `NOWPAYMENTS_EMAIL`, `_PASSWORD`, `_2FA_SECRET` | Turn on automatic payouts for crypto refunds and withdrawals                                                                                 |
| `AUTO_WITHDRAW_*`                               | Safety limits for automatic payouts (also editable in Admin > Settings)                                                                      |
| `VTPASS_*`                                      | VTpass keys. Mode is chosen per provider in Admin > Providers, which also picks sandbox or live addresses. A value of `null` counts as empty |
| `VTPASS_WEBHOOK_SECRET`                         | VTpass does not sign callbacks, so the callback URL carries this secret and the result is re-checked with a status call                      |

Never commit `.env.local`. Rotate any key that has ever been pasted into a chat or a screenshot.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A MongoDB Atlas cluster (or a local replica set)
- Brevo and Cloudinary accounts
- A NOWPayments sandbox account and a VTpass sandbox account to run the full order flow

### Install

```bash
npm install
cp .env.example .env.local   # fill in the required block
```

### First run

```bash
npm run seed                 # creates or updates the admin account only
npm run dev                  # http://localhost:3000
```

Then, signed in as the admin:

1. **Admin > Providers:** add VTpass (sandbox). Press **Test connection** to read the sandbox wallet.
2. **Admin > Catalogue:** use **Sync catalogue** on the provider to import real products, review the cost, and show the
   ones you want. (`npm run seed:catalogue` loads small mock-provider samples instead.)
3. **Admin > Pricing:** set the markup, the minimum margin and the **naira per dollar** rate.
4. **Admin > Payment methods:** activate the coins and networks you accept.
5. **Admin > Settings > Ordering:** open ordering. It is closed by default.

### Production build

```bash
npm run build
npm run start
```

## Available Scripts

| Command                                 | What it does                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                           | Start the development server (Turbopack)                                                                                  |
| `npm run build` / `npm run start`       | Build and run the production bundle                                                                                       |
| `npm run lint` / `npm run typecheck`    | ESLint and the TypeScript checker                                                                                         |
| `npm test`                              | Fast checks with no database: pricing, provider adapters, security, access rules                                          |
| `npm run test:db`                       | Checks against the database in `.env.local`, using throwaway data they remove afterwards                                  |
| `npm run seed`                          | Create or update the admin account. Safe, deletes nothing. Add `-- --reset-2fa` if the admin lost their authenticator app |
| `npm run seed:catalogue`                | Load sample categories and products that use the mock provider only. Safe to repeat                                       |
| `npm run reset`                         | **Wipes the whole database** and recreates the admin and asset catalogue. Asks you to type the database name first        |
| `npm run test:email -- you@example.com` | Send a Brevo test email                                                                                                   |

## Important Routes

### Public

- `/`: landing page
- `/airtime`, `/data`, `/electricity`, `/tv`: the public shop (browse without an account)
- `/register`, `/login`, `/login/mfa`, `/verify-email`, `/forgot-password`, `/reset-password`
- `/terms`, `/privacy`, `/refunds`, `/risk` (drafts), `/offline`

### Customer app (`/dashboard`)

- `/dashboard`: overview, with a tile for everything you can pay for
- `/dashboard/shop` and `/dashboard/shop/[category]`: the shop inside the app
- `/dashboard/orders` and `/dashboard/orders/[id]`: order list and live detail
- `/dashboard/transactions`: store credit with a running balance
- `/dashboard/notifications`, `/dashboard/support` (and `/[id]`), `/dashboard/settings`
- `/receipt/order/[id]`: printable order receipt

### Admin (`/admin`)

- `/admin`: overview and needs-attention list
- `/admin/orders` (and `/[id]`), `/admin/catalogue` (and `/sync`), `/admin/pricing`, `/admin/providers`
- `/admin/reconciliation`, `/admin/reports` (and `/export`)
- `/admin/users` (and `/[id]`), `/admin/support` (and `/[id]`), `/admin/messages`
- `/admin/deposits`, `/admin/withdrawals`, `/admin/transactions`, `/admin/payment-methods`
- `/admin/email-log`, `/admin/audit`, `/admin/settings`
- `/admin/export/[resource]`: CSV of any table. `/admin/kyc/[userId]/[kind]`: streams one identity photo to an admin

### API and jobs

- `POST /api/webhooks/payments`: payment and payout callbacks (HMAC-SHA512 signature, fails closed)
- `POST /api/webhooks/providers/[key]`: fulfilment provider callbacks (secret in the URL, confirmed by a status call)
- `POST /api/webhooks/brevo?token=...`: email delivery, bounce and complaint events
- `GET /api/cron/payments`, `/api/cron/fulfilment`, `/api/cron/emails`: scheduled jobs, protected by `CRON_SECRET`
- `GET /api/me`: who is signed in, for the public pages (rate limited)

User actions are Next.js server actions, authorised inside each action, not REST endpoints.

## Roles and Permissions

| Role     | Can do                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`  | Everything. Created with `npm run seed`.                                                                                                                |
| `staff`  | View orders, retry fulfilment, add notes, resend emails, refund to store credit, mark delivered (with proof), cancel unpaid orders, and answer support. |
| customer | Their own orders, store credit, tickets and settings.                                                                                                   |

The rule lives in `lib/auth/permissions.ts` and is enforced in three places: on every admin page, in every server
action, and inside the order services. A hidden button is never the protection. Staff cannot change the catalogue,
pricing, providers, settings or users, cannot refund to crypto, cannot reveal a code, and cannot see cost or margin.
An admin makes someone staff from their user page. Turn on two-step login for every staff account.

## Fulfilment Engine

A paid order is placed with its provider **exactly once**, then delivered or refunded exactly once.

- The order is claimed with an atomic guard (`paid -> fulfilling`) and its provider request id is stored once.
- One worker advances an order at a time (a short lease), and `purchaseSentAt` is written **before** the first send.
  After a crash the order is only asked about, and is bought again only if the provider says it has no record.
- Unclear answers (timeout, odd reply) are checked with the status call, never retried blindly. Pending or unclear for
  six hours goes to a person.
- A definite refusal moves to `failed` and refunds to store credit in one transaction. Refusals that are about our
  side (low float, provider down, key problems) go to `review` instead, so a float top-up can still save the order.
- Retries run from the provider callback, from the customer opening the order, and from `/api/cron/fulfilment`. On
  Vercel's free plan the cron runs once a day, so quick retries depend on callbacks and page opens; a paid plan can
  run it every few minutes.
- An admin retry first asks the provider about the earlier attempt and sends again only with a new request id when
  the provider never took it. It can never double-buy.

## Data Model

MongoDB collections (Mongoose models in `lib/models.ts`, created with `defineModel()`):

| Group     | Models                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Accounts  | `User` (role, ordering controls, risk flags), `Session`, `EmailToken`, `RateLimit`, `Idempotency`                                          |
| Catalogue | `ServiceCategory`, `Product`, `Provider`, `FloatTopUp`                                                                                     |
| Orders    | `Order` (with snapshot, payment, fulfilment, delivery and refund), `OrderEvent`                                                            |
| Money     | `LedgerEntry` (store credit with a running balance), `Deposit`, `Withdrawal`, `Asset` (coins and networks)                                 |
| Identity  | `Kyc`                                                                                                                                      |
| Platform  | `Notification`, `PushSubscription`, `Ticket`, `TicketMessage`, `Message`, `MessageTemplate`, `EmailLog`, `UserNote`, `AuditLog`, `Setting` |

All money is stored as integer minor units (kobo and cents). `Deposit` and `Withdrawal` are kept only for crypto
refunds; customers pay per order and have no wallet to top up.

## Project Structure

```text
Meridian/
├── app/
│   ├── (auth)/              Sign-in, sign-up, verification, reset
│   ├── (shop)/[category]/   Public shop pages
│   ├── (app)/dashboard/     Customer app: shop, orders, store credit, support, settings
│   ├── admin/               Admin and staff back office
│   ├── receipt/             Printable order receipts
│   ├── api/                 Webhooks, cron jobs, small public endpoints
│   ├── actions/             Server actions (auth, user, orders, order-admin, catalogue, support, admin)
│   └── ...                  Landing page, legal pages, manifest, sitemap
├── components/
│   ├── sections/            Landing page sections and the notch header
│   ├── shop/                Checkout dialog, product cards, "pay for" tiles
│   ├── app/                 App and admin components (forms, tables, dialogs, pickers)
│   ├── ui/                  shadcn/ui primitives and the image lightbox
│   ├── pwa/                 Install prompt, push toggle, service worker registration
│   └── logos/               Meridian wordmark and mark
├── lib/
│   ├── models.ts            All Mongoose models
│   ├── services/            Orders, order payments, fulfilment, refunds, pricing, catalogue, reports,
│   │                        order admin, KYC, support, notify, ledger, errors
│   ├── providers/           Fulfilment adapters (mock, VTpass), safe-purchase helpers, redaction
│   ├── payments/            NOWPayments client
│   ├── auth/                Sessions, guards, permissions, rate limits, idempotency
│   ├── admin/               Table query and CSV export toolkit
│   ├── email/               Brevo client, templates, design
│   ├── storage/             Cloudinary client for private documents
│   └── log.ts               Structured logging without secrets
├── content/                 Site copy and message templates
├── scripts/                 seed, seed-catalogue, reset, test-email
├── tests/                   Pricing, providers, security, access rules, and database simulations
├── docs/                    BUILD_PLAN, DECISIONS, SECURITY_REVIEW, LAUNCH_CHECKLIST
└── public/                  Icons, crypto logos, service worker
```

## Integrations

### NOWPayments (crypto payments)

1. Create an account and get an API key and an IPN secret (Store settings). Test in the sandbox first.
2. Set the `NOWPAYMENTS_*` variables. The app sends its callback address with each payment, so no dashboard URL is
   required. The callback is `https://YOUR-DOMAIN/api/webhooks/payments` and needs a public https address.
3. Check **Admin > Settings > Payments** and press **Test connection**.

### VTpass (fulfilment)

1. Create a sandbox account. In the API settings set the authentication type to **All** (or API keys), then generate the
   static API key and the public and secret keys. The public and secret keys are shown once.
2. Add the keys to `.env.local`, add VTpass in **Admin > Providers**, and press **Test connection**.
3. Use **Sync catalogue** to import real products. Each imported product cost assumes no VTpass commission, so lower
   the cost percentage once you have read your commission rate.
4. Set the callback to `https://YOUR-DOMAIN/api/webhooks/providers/vtpass?secret=VTPASS_WEBHOOK_SECRET`.

### Brevo (email) and Cloudinary (identity photos)

Every email is logged with retry and backoff, and hard bounces and complaints suppress the address. Set the Brevo
webhook to `https://YOUR-DOMAIN/api/webhooks/brevo?token=BREVO_WEBHOOK_SECRET`. Identity photos upload from the browser
with a one-time signature, are stored as private assets, and are viewed by admins only through `/admin/kyc/...`.

## Security Notes

- Passwords are hashed with bcrypt. Sessions are opaque, server-side and revocable. Two-step login has recovery codes.
- Sensitive fields (ID numbers, two-step secrets, delivered tokens) are encrypted with AES-256-GCM.
- Authorisation runs in every page, action and route handler, never only in `proxy.ts`. Ownership is part of the query.
- Webhooks verify a signature or a secret and fail closed. Crons need `CRON_SECRET`.
- Rate limits cover sign-up, login, password reset, quotes, ordering, identity submission and sensitive account actions.
- Logs are structured JSON with secrets scrubbed, and admins get an email when a webhook, cron job or fulfilment step
  fails.
- Security headers are set in `next.config.mjs`: a baseline content security policy, no framing, `nosniff`, a strict
  referrer policy and HSTS.
- Every admin action writes an audit entry. Exports and every view of a customer's code are logged too.

The full route-by-route review is in [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md).

## Testing

```bash
npm test          # no database needed
npm run test:db   # uses the database in .env.local, with throwaway data it removes afterwards
```

| Suite                | What it proves                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pricing.test.ts`    | Markup, rounding up, the minimum margin floor, naira and dollar conversion, line parsers                                            |
| `providers.test.ts`  | Exact VTpass request shapes, reply classification, timeouts never causing a second purchase, fail-closed callbacks, redaction       |
| `security.test.ts`   | Payment callback signatures, encryption at rest, log scrubbing, key handling                                                        |
| `guards.test.ts`     | Reads the source and fails if any admin page, action or route loses its guard, or staff are let into an admin-only one              |
| `idempotency.sim.ts` | Five simultaneous submits run once; rate limits count correctly                                                                     |
| `orders.sim.ts`      | Server pricing, inputs, limits, payment states, the order state machine, underpaid and late payments                                |
| `fulfilment.sim.ts`  | Success, pending then success, failure, timeout, no response, a crash mid-purchase, duplicate and forged callbacks, view-once codes |
| `admin.sim.ts`       | Staff and admin permissions, retry safety, refund exactly once, reports, customer controls                                          |

When you change money behaviour (pricing, payments, fulfilment, refunds), add a test beside it.

## Deployment Notes

1. Deploy to a Node host such as Vercel, with every required variable in the host's secret store and
   `NEXT_PUBLIC_SITE_URL` set to the https address.
2. Use MongoDB Atlas (or a replica set), so money movements run in transactions.
3. `vercel.json` schedules the cron jobs once a day, which works on Vercel's free plan. Faster schedules need a paid
   plan. The order page also re-checks with the provider on every open, so nothing depends on the cron alone.
4. Set the payment provider's callback and IPN secret, the VTpass callback URL with its secret, and the Brevo webhook.
5. Run `npm run seed` once on a new database to create the admin.
6. Keep `NOWPAYMENTS_SANDBOX=true` and the provider in sandbox mode while this is a demo.

### Before real money

This is the short version. The full list is in [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md).

- Legal review of the Terms, Privacy, Refund and Risk pages, and the right business registration for your country
- Written approval from the payment processor and the provider for this business model
- A tested backup restore, a regenerated key for anything ever shared in chat, and a funded provider float
- A full sandbox order, a failed order and a late payment, then one small live order with your own money

## Known Gaps

- Gift cards are not on sale. No gift card provider is connected yet, and one adapter file would add it
- Paying an order with store credit is not built, and there is no guest checkout
- Refunds to crypto go through the existing withdrawal flow, which needs the customer to be identity verified
- Price history is kept in the audit log, not as its own record, and there is no email template editor
- The content security policy still allows inline scripts that Next.js needs; a nonce-based policy is the next step
- VTpass callbacks are unsigned, so they are treated as hints and confirmed with a status call
- Merchant payment links (pay links and invoices for freelancers) are out of scope
- There are no automated browser tests; the interface is checked by hand

## Documentation

- [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md): the phased build plan and the rules every change follows
- [`docs/DECISIONS.md`](docs/DECISIONS.md): choices made, placeholders, and what was confirmed in each provider's docs
- [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md): route-by-route security review
- [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md): everything to do before real money

## Colours and Theme

Design tokens are CSS variables in [`app/globals.css`](app/globals.css): electric blue `--brand` (`#2459f2`), gold
`--gold` (`#d4af37`) and a near-black dark background (`#08090d`). Light mode is the default. The public header uses an
`.invert-theme` surface, dark in light mode and light in dark mode.

## Vision

Meridian should make paying for everyday things with crypto feel boring in the best way: clear prices, an exact amount
to send, an honest note about how long it takes, and a receipt. The code exists to make every step correct and
repeatable, so that one person can run the business from one admin screen.
