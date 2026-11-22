# Meridian build plan: pay bills with crypto (gift cards later)

This file is the full brief for the next build. It is written so a **new chat can start with no memory**: it says what
exists, what to build, in what order, and gives a ready-to-paste prompt for every phase.

> **How to start the new chat**
> Open the project folder, start a fresh chat and paste this as the first message:
>
> ```text
> Read docs/PIVOT_PLAN.md fully, then AGENTS.md and README.md. Do Phase 0 only, following the rules in section 3
> and the working conventions in section 9. Do not start Phase 1 until I say so. When Phase 0 is done, run lint,
> typecheck and build, and tell me what changed and what is next.
> ```
>
> After each phase, start the next one with: `Do Phase N from docs/PIVOT_PLAN.md.` Keep one phase per chat session if
> the chat gets long.

---

## 1. The product

Meridian earns a **margin on real goods and services**. Nobody is promised a return.

**Product:** _Meridian: spend your crypto on everyday bills. Gift cards are coming soon._

- Customers pay for an order **in crypto** (USDT, BTC, ETH, SOL, and others through NOWPayments).
- Meridian buys the item from a provider (airtime, data, electricity, cable TV) and delivers it.
- Revenue is the **markup** between the provider price and what the customer pays. Nobody is promised a return.

**Design choice that keeps risk low: pay per order, no wallet balance.**
Each order gets its own crypto payment request for exactly its price. The customer pays it, Meridian fulfils the
order. Meridian does not hold a stored balance for customers, so custody, regulation and security exposure are far
smaller. The only stored value is **store credit created by a refund** (section 4.4).

Later (Phase 7) the same payment engine can offer **payment links and invoices** to merchants and freelancers.
**P2P escrow is out of scope.** It needs custody, a disputes team and enough users on both sides.

### What the admin does

"The admin handles it all." The business is run from the admin panel: catalogue and prices, provider accounts and
float, orders and fulfilment, refunds, customers, support, reports and settings. Section 5 lists every admin
capability. Anything that can be automated should be, with the admin as the safety net and the decision maker.

---

## 2. What already exists (reuse it, do not rebuild it)

Stack: **Next.js 16** (App Router, Turbopack, `proxy.ts` instead of middleware), React 19, TypeScript, Tailwind CSS 4,
shadcn/ui (Radix), Mongoose + MongoDB, Zod, Sonner, lucide-react, next-themes, Recharts, otplib, web-push.
`AGENTS.md` says Next.js 16 has breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before
writing framework code.

| Area                                                      | Where                                                                                                                                             | Reuse for the pivot                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Auth: sessions, MFA (TOTP), recovery codes, rate limits   | `lib/auth/*`, `lib/services/auth.ts`, `app/(auth)/*`                                                                                              | Keep as is                                                               |
| Identity (KYC) with private photo upload                  | `lib/services/kyc.ts`, `lib/storage/cloudinary.ts`, `components/app/kyc-form.tsx`, `document-upload.tsx`, `app/admin/kyc/[userId]/[kind]`         | Keep. Use for limits and higher tiers                                    |
| Online crypto payments (NOWPayments): invoices, IPN, sync | `lib/payments/nowpayments.ts`, `lib/services/deposits.ts`, `lib/services/payment-events.ts`, `app/api/webhooks/payments`, `app/api/cron/payments` | **Core of the order payment step.** Generalise from "deposit" to "order" |
| Ledger with running balance, atomic credit/debit          | `lib/services/ledger.ts` (`credit`, `debit`, `withTx`)                                                                                            | Keep for store credit and refunds                                        |
| Admin shell, tables, filters, CSV export, detail pages    | `app/admin/*`, `lib/admin/resources.ts`, `components/app/table-toolbar.tsx`, `pagination.tsx`, `ui.tsx`                                           | Pattern for every new admin screen                                       |
| Email (Brevo) with retry log, templates, branded design   | `lib/email/*`                                                                                                                                     | Order emails                                                             |
| Notifications, web push, installable PWA                  | `lib/services/notify.ts`, `push.ts`, `components/pwa/*`, `public/sw.js`                                                                           | Order status updates                                                     |
| Support tickets (two-way) and admin messaging             | `lib/services/support.ts`, `messages.ts`, `app/admin/support`, `app/admin/messages`                                                               | Keep. Link tickets to orders                                             |
| Idempotent form submits, offline banner                   | `lib/auth/idempotency.ts`, `components/app/form.tsx`                                                                                              | Keep for order creation                                                  |
| Printable receipts                                        | `app/receipt/*`, `components/app/receipt.tsx`                                                                                                     | Order receipts                                                           |
| Audit log, activity, referrals, settings store            | `lib/services/notify.ts` (`audit`), `referrals.ts`, `Setting` model                                                                               | Audit: keep. Referrals: optional                                         |
| Brand, logo, design tokens                                | `content/site.ts`, `components/logos/meridian.tsx`, `app/globals.css`                                                                             | Keep tokens: blue `#2459f2`, gold `#d4af37`, dark `#08090d`              |

---

## 3. Non-negotiable rules for every phase

These come from earlier decisions and from keeping the business legal and safe. Follow them in every prompt.

1. **No investment language, anywhere.** Remove or never write: returns, yield, interest, profit, ROI, APY, plans,
   "earn", "passive income", "guaranteed", "risk-free", "double", "projected". Meridian sells goods and services.
2. **No fake activity or fake numbers.** No invented testimonials, user counts, ticker events or reviews. Show only
   real data, or nothing.
3. **Honest copy about crypto and delivery.** State prices in the local currency and USD, the rate lock window, that
   crypto payments are final, the refund policy, and typical delivery times. Never promise instant delivery unless
   it is true.
4. **Never trust the browser or a webhook.** Every price is recomputed on the server from the catalogue at order
   creation. Every provider or payment callback is verified (signature) and processed **idempotently**. An order is
   fulfilled **at most once**.
5. **Money safety.** Integer minor units only. All state changes that move money or stock use `withTx` and atomic
   `findOneAndUpdate` guards. A payout, purchase or refund must be impossible to run twice.
6. **Secrets.** Never print, log, commit or echo keys. They live in `.env.local` (gitignored) and the host's secret
   store. Provider tokens and codes are **encrypted at rest** (`lib/crypto.ts`, AES-256-GCM) and shown to
   the owner only, with every admin view written to the audit log.
7. **Limits and abuse controls.** Per-user and per-day order limits, a velocity check, KYC required above a
   threshold, rate limiting on order creation, and a manual-review state for anything unusual.
8. **Refund policy is code, not a promise.** A paid order that cannot be fulfilled is refunded automatically to
   **store credit**, and the admin can choose a crypto refund instead (Phase 6).
9. **Legal drafts are drafts.** The Terms, Privacy and Refund pages must be rewritten for the new business and
   reviewed by a lawyer before launch. Say so in the README and admin.
10. **Check regulation before taking real money.** At minimum, confirm what applies to selling airtime, data,
    electricity tokens and cable, and to accepting crypto payments, in each country served (for Nigeria:
    relevant CBN and SEC guidance, and the provider's own merchant terms). Get the payment processor's written
    approval for the business model.
11. **Providers' terms come first.** Each provider (VTpass, and any added later) has rules on resale, branding, refunds
    and volume. Read them before building against them.

---

## 4. Product design

### 4.1 Catalogue

Categories (each is a `ServiceCategory`):

| Category           | Examples                           | Input the customer gives               | Typical provider |
| ------------------ | ---------------------------------- | -------------------------------------- | ---------------- |
| Airtime            | MTN, Airtel, Glo, 9mobile          | phone number, amount                   | VTpass           |
| Data bundles       | MTN 1.5GB 30 days, and so on       | phone number, bundle                   | VTpass           |
| Electricity tokens | prepaid and postpaid by DISCO      | meter number, meter type, amount       | VTpass           |
| Cable TV           | DStv, GOtv, StarTimes              | smartcard number, bouquet              | VTpass           |
| Gift cards (later) | Amazon, iTunes, Steam, Google Play | denomination, country, recipient email | not chosen yet   |

Each **Product** has: provider, provider product code, category, name, logo, input fields (validated on the server),
min and max amount (for open amounts) or fixed denominations, currency, cost price (what the provider charges),
**markup rule** (percent, fixed, or tiered), status (active, hidden, out of stock), sort order, and delivery notes.

### 4.2 Order flow (state machine)

```
created -> awaiting_payment -> paid -> fulfilling -> delivered
                 |               |          |
                 v               v          v
              expired        review     failed -> refunded (credit | crypto)
                          (admin decides)
cancelled (before payment)
```

- **created**: server validated the inputs and locked the price and rate for a short window.
- **awaiting_payment**: a NOWPayments payment exists (address, crypto amount, expiry).
- **paid**: provider confirmed the full amount. Underpaid orders go to **review** for the admin.
- **fulfilling**: the purchase request to the provider is in flight. Guarded so it can only start once.
- **delivered**: provider confirmed. Electricity tokens and codes are stored encrypted and shown to the
  customer; an email and notification are sent.
- **failed**: provider rejected or timed out after retries. Auto-refunds to store credit unless the admin intervenes.
- **review**: anything the system cannot decide (underpaid, flagged, provider "pending" for too long).

Every transition writes an **OrderEvent** (who or what, when, why). Nothing is deleted.

### 4.3 Pricing

- Prices are shown in **NGN (or the configured currency) and USD**. Crypto amount is quoted by NOWPayments when the
  payment is created; the rate is locked for the payment window.
- The admin sets a **default markup** and per-product overrides. The customer price is computed on the server:
  `price = ceil(cost x (1 + markup))` in minor units, then converted to USD with a stored FX rate that the admin
  can set or that comes from a rate feed with a safety margin.
- Show the customer the total only (no hidden fee at checkout). Show the admin cost, price and margin per order.

### 4.4 Store credit and refunds

- The existing `balanceCents` and `LedgerEntry` become **store credit**, filled **only by refunds** (and admin
  adjustments). It can pay for future orders. It cannot be withdrawn by the customer by default.
- The admin can refund a paid order **to crypto** instead, using the existing payout code (kept, but admin-driven).
- Remove customer-facing **Deposit** and **Withdraw** screens. Keep the code needed for crypto refunds.

### 4.5 Customers

Accounts stay (email, username, MFA, KYC). A **guest checkout** (email only, order lookup by emailed link) is an
optional later improvement. Orders are limited per user, per day, and by KYC tier:

| Tier | Requirement    | Example daily limit |
| ---- | -------------- | ------------------- |
| 0    | verified email | small (admin-set)   |
| 1    | KYC approved   | higher (admin-set)  |

---

## 5. What the admin handles

Everything below is an admin screen or setting. Build these as part of the phases, using the same table, filter,
export and detail-page patterns the admin already has.

**Dashboard**

- Today and 30 days: orders, revenue, cost, **gross margin**, refunds, failed orders, average delivery time.
- Money in vs. float: provider wallet balances, low-float alerts, crypto received, pending payments.
- Needs attention: orders in **review**, failed orders, underpaid payments, low float, open support tickets.

**Orders**

- List with search (order no., email, phone, meter, reference), filters (status, category, provider, date, amount),
  pagination, CSV export.
- Detail page: customer, inputs, price breakdown (cost, markup, total), payment (provider status, tx, confirmations),
  fulfilment attempts, provider responses, timeline of events, linked support tickets.
- Actions: **retry fulfilment**, **mark as delivered manually** (with proof), **refund to credit**, **refund to
  crypto**, cancel, add internal note, resend delivery email, reveal gift code (audited).

**Catalogue**

- Categories, products, logos, inputs and validation rules, denominations, status and sort order.
- **Pricing**: default markup, per-category and per-product markup, minimum margin guard (never sell below cost),
  bulk price update, price history.
- **Sync from provider** to import and refresh product lists and costs, with a diff the admin approves.

**Providers and float**

- Provider accounts (sandbox or live), health check, wallet balance, **low-balance threshold**, enable or disable a
  provider (the storefront hides its products), failover order if two providers sell the same product.
- Top-up reminders and a record of float top-ups (how much the admin paid into the provider).

**Customers**

- User list and detail (existing), orders per customer, limits, KYC review (existing), suspend, notes, order and
  refund history, risk flags.

**Payments**

- NOWPayments status, webhook URL, test connection, reconciliation view (orders whose payment status differs from
  the provider), underpaid and overpaid queue, refunds out.

**Support**

- Existing two-way tickets, with the order attached, canned replies for common cases (pending, wrong number,
  failed, refund status).

**Money and reports**

- Revenue, cost and margin by day, product, category and provider. Refund rate. Provider spend. CSV exports.
- Store-credit ledger (existing transactions page, relabelled).

**Settings and safety**

- Order limits, velocity rules, KYC thresholds, payment window, FX rate and markup defaults, maintenance mode,
  per-provider kill switch, notification recipients, email templates, legal page versions.
- Audit log of every admin action (existing), including every view of a gift code or token.
- Optional second role, **staff**, who can handle orders and support but cannot change pricing, providers,
  settings or refunds to crypto (Phase 6).

---

## 6. Data model (Mongoose, in `lib/models.ts` with `defineModel`)

New models. Money is in integer minor units. Add indexes for every field used in admin filters.

- **ServiceCategory**: `slug`, `name`, `icon`, `sort`, `active`, `inputs[]` (field definitions).
- **Provider**: `key` (vtpass, mock), `name`, `mode` (sandbox, live), `active`, `priority`,
  `lowBalanceMinor`, `lastBalanceMinor`, `lastCheckedAt`, `status`.
- **Product**: `categoryId`, `providerKey`, `providerCode`, `name`, `logo`, `kind` (fixed, open), `denominations[]`,
  `minMinor`, `maxMinor`, `currency`, `costMinor` (or per-denomination), `markup` (`type`: percent, fixed;
  `value`), `inputs[]`, `status`, `sort`, `notes`.
- **Order**: `number` (`ORD-XXXXXX`), `userId`, `productId`, `snapshot` (name, provider, cost, markup, price, FX
  rate), `inputs` (validated), `amountMinor` (customer price), `currency`, `amountUsdCents`, `status`,
  `payment` (`provider`, `paymentId`, `address`, `payAsset`, `payAmount`, `status`, `expiresAt`, `paidAt`),
  `fulfilment` (`attempts`, `lastAttemptAt`, `providerRef`, `providerStatus`, `deliveredAt`),
  `delivery` (`encryptedPayload` for codes and tokens, `viewedAt`), `refund` (`type`, `amountMinor`, `reason`),
  `reviewReason`, `idempotencyKey`, timestamps. Unique index on `number` and on `payment.paymentId`.
- **OrderEvent**: `orderId`, `type`, `actor` (`system`, `user`, admin id), `from`, `to`, `message`, `meta`, `at`.
- **ProviderCall** (optional, short TTL): redacted request and response for debugging, never secrets.
- **FloatTopUp**: `providerKey`, `amountMinor`, `note`, `by`, `at`.

Reused models: `User`, `Session`, `Kyc`, `LedgerEntry`, `Notification`, `AuditLog`, `Setting`, `Ticket`,
`TicketMessage`, `EmailLog`, `PushSubscription`, `Idempotency`, `Message`, `UserNote`, `RateLimit`, `EmailToken`.
Retire: `Plan`, `Investment`, `Asset` networks for deposits (keep what crypto refunds need), `Referral` (optional).

---

## 7. Services and files to add

```
lib/providers/types.ts           Provider interface: balance(), catalogue(), quote(), purchase(), status(), webhook
lib/providers/vtpass.ts          airtime, data, electricity, cable (sandbox + live)
lib/providers/mock.ts            deterministic fake provider for dev and tests (always on in sandbox)
lib/providers/index.ts           registry, health, failover
lib/services/catalogue.ts        read models for the storefront, price computation
lib/services/pricing.ts          markup, FX, rounding, minimum margin guard
lib/services/orders.ts           create, price lock, state machine, limits, idempotency
lib/services/order-payments.ts   NOWPayments invoice per order (generalised from deposits.ts / payment-events.ts)
lib/services/fulfilment.ts       claim, purchase, retry with backoff, deliver, fail -> refund
lib/services/refunds.ts          credit refund, crypto refund request, audit
app/api/webhooks/payments        extend: route payment events to orders
app/api/webhooks/providers/[key] provider callbacks (signed or secret-in-URL, fail closed)
app/api/cron/fulfilment          retry stuck orders, expire unpaid, check provider float
app/(shop)/...                   public storefront: /, /airtime, /data, /electricity, /tv, /track
app/(app)/dashboard/orders/...   customer order list, detail, receipt, delivery reveal
app/admin/orders, catalogue, providers, pricing, reports, ...
```

---

## 8. Phases and prompts

Work **one phase at a time**. Each phase ends with: `npm run lint`, `npx tsc --noEmit`, `npm run build`, a short
summary, and a note of anything left. Do not skip a phase's acceptance checks.

### Phase 0: Safety, cleanup and decisions (no new features)

**Goal:** stop the investment model before anything else is built, and capture the decisions in writing.

**Prompt**

```text
Do Phase 0 from docs/PIVOT_PLAN.md.
1. Create docs/DECISIONS.md. Ask me (one AskUserQuestion with up to 4 questions) for: the country and currency to
   start with, the first providers I have accounts with (VTpass, none yet), the default markup percent,
   and whether guest checkout is wanted. Record my answers and the open questions.
2. Disable the investment product without deleting history: remove the Plans, Investments, Portfolio, Referrals,
   daily-earnings and activity tickers from navigation and routes; stop /api/cron/accrue; hide the invest wizard.
   Keep the code in git history rather than leaving dead screens. Keep Deposit and Withdraw working until Phase 4
   replaces them, but label them "temporary".
3. Remove investment language from every user-facing string and metadata (rules in section 3). Replace the hero and
   landing copy with a short honest placeholder for the new product; the full rewrite is Phase 1.
4. Restore a valid vercel.json with Hobby-safe daily crons only if it is missing.
Run lint, tsc, build. Do not add new features.
```

**Acceptance:** no page mentions returns, plans, profit or yield; the app builds; `docs/DECISIONS.md` exists; nothing
else changed.

### Phase 1: Brand, landing page and legal rewrite

**Goal:** the public site sells the real product honestly.

**Prompt**

```text
Do Phase 1 from docs/PIVOT_PLAN.md, using docs/DECISIONS.md. Rewrite content/site.ts and the landing sections for
"Meridian: spend your crypto on everyday bills": hero, how it works (choose, pay with crypto,
receive), categories with logos, supported coins (real logos from public/crypto), delivery times (honest), FAQ,
refund policy summary, support. Remove the plans, calculator, stats and growth chart sections and the investor
dashboard mockup (replace with an order-status mockup using real components). Rewrite /terms, /privacy and add
/refunds for the new business, marked as drafts needing legal review. Update SEO, OG image, manifest and README
copy. No fake numbers or testimonials. Follow section 3.
```

**Acceptance:** banned words absent (`grep -ri` for returns, yield, profit, invest, plan); legal pages exist as
drafts; Lighthouse-style basics pass (titles, alt text, contrast).

### Phase 2: Data model and catalogue admin

**Goal:** products and pricing live in the database and are managed from the admin.

**Prompt**

```text
Do Phase 2 from docs/PIVOT_PLAN.md. Add the ServiceCategory, Provider, Product, FloatTopUp models (section 6) and
lib/services/pricing.ts and catalogue.ts. Build admin pages: /admin/catalogue (categories and products table with
search, filters, status toggle, reorder, CSV export), a product create/edit dialog with input-field definitions and
markup, /admin/pricing (default markup, per-category and per-product overrides, minimum margin guard, bulk update),
and /admin/providers (list, enable/disable, mode, low-balance threshold). Add a seed script (npm run seed:catalogue)
that loads sample categories and products through the mock provider only. All money in minor units; validation with
Zod; every admin action audited. Follow the admin patterns in app/admin/payment-methods and app/admin/plans.
```

**Acceptance:** admin can create a product, change markup, and see the computed customer price; price can never be
set below cost; seed is idempotent.

### Phase 3: Provider adapters (mock first, then VTpass)

**Goal:** a clean provider interface with a safe mock for development.

**Prompt**

```text
Do Phase 3 from docs/PIVOT_PLAN.md. Define lib/providers/types.ts (balance, catalogue, validate-input, purchase,
status, parseWebhook) and build mock.ts first (deterministic outcomes: success, pending-then-success, fail,
timeout) so everything can be tested without real money. Then build vtpass.ts for airtime, data, electricity and
cable using the sandbox,  Read each provider's current official docs first and
note any field-name uncertainty in docs/DECISIONS.md. Never log secrets; redact request and response bodies. Add
a health check and balance fetch per provider, an admin "Test connection" and "Refresh balance" action, a catalogue
sync with an approve-the-diff screen, and idempotent purchase requests (provider request id = order number).
```

**Acceptance:** mock covers all outcomes; sandbox calls work with test credentials; timeouts never lead to a second
purchase (status check before retry).

### Phase 4: Storefront and checkout (pay per order)

**Goal:** a customer can pick an item and pay for it in crypto.

**Prompt**

```text
Do Phase 4 from docs/PIVOT_PLAN.md. Build the storefront (/, /airtime, /data, /electricity, /tv)
reading the live catalogue, a checkout dialog with validated inputs (phone, meter, smartcard, email) and a price
summary, and order creation in lib/services/orders.ts: server-side price recomputation, limits, rate limiting,
idempotency key, price/rate lock. Generalise the NOWPayments deposit code into lib/services/order-payments.ts so an
order creates a payment with its own address and amount; reuse the webhook, the re-check on page load and the
reconcile cron. Build /dashboard/orders (list, detail with live status, countdown, copy fields, QR) and the order
receipt (reuse app/receipt). Order numbers ORD-XXXXXX. Replace the Deposit and Withdraw screens and their nav items.
```

**Acceptance:** with sandbox keys an order moves awaiting_payment -> paid; double webhooks do not double-process;
amounts are recomputed server-side; expired orders close.

### Phase 5: Fulfilment engine and delivery

**Goal:** paid orders are fulfilled exactly once, or refunded.

**Prompt**

```text
Do Phase 5 from docs/PIVOT_PLAN.md. Build lib/services/fulfilment.ts: on paid, atomically claim the order, call the
provider once (request id = order number), handle pending/success/fail, retry with backoff via
/api/cron/fulfilment, and check status before any retry. On success store codes and tokens encrypted (lib/crypto),
mark delivered, write OrderEvents, email and notify. On final failure, auto-refund to store credit through
lib/services/refunds.ts (ledger credit in a transaction), email the customer, alert the admin. Underpaid, flagged
or stuck orders go to status "review". Codes and tokens are revealed to the owner on the order page (audited,
view-once option), never emailed in clear text unless the product is set to allow it. Add provider webhooks at
/api/webhooks/providers/[key], fail closed. Write a simulation script like earlier ones that drives the mock provider
through every outcome and proves: fulfilled once, refunded once, no double credit.
```

**Acceptance:** simulation passes for success, pending-then-success, fail, timeout, duplicate webhook, and server
crash mid-purchase (status check, not a second purchase).

### Phase 6: Admin handles everything

**Goal:** the admin panel covers every item in section 5.

**Prompt**

```text
Do Phase 6 from docs/PIVOT_PLAN.md. Build the admin experience in section 5: a new dashboard (orders, revenue,
cost, margin, refunds, failed, delivery time, float, needs-attention list), /admin/orders (filters, search, CSV)
and order detail with actions (retry fulfilment, mark delivered manually with proof, refund to credit, refund to
crypto, cancel, notes, resend email, reveal code with audit), provider float panel with low-balance alerts and
top-up log, reconciliation view, reports (by day, product, category, provider; margin; refund rate), order-linked
support tickets and canned replies, customer limits and risk flags, settings (limits, KYC thresholds, FX and markup
defaults, maintenance mode, provider kill switch). Add a second role "staff" with limited permissions (orders and
support only) enforced in guards and server actions, not only in the UI. Every action audited.
```

**Acceptance:** a staff user cannot change pricing, providers, settings or refund to crypto even by calling the
action directly; every admin action appears in the audit log.

### Phase 7 (optional): Payment links and invoices for merchants

**Goal:** reuse the payment engine for simple merchant payment links.

**Prompt**

```text
Do Phase 7 from docs/PIVOT_PLAN.md only after confirming in docs/DECISIONS.md that my payment processor allows
this model. Add merchant accounts, payment links and invoices (amount, description, optional fixed currency),
customer pay page, merchant dashboard, settlement/payout flow with limits and admin approval, fees, and receipts.
Reuse order-payments.ts. Add terms specific to merchants.
```

### Phase 8: Hardening and launch checklist

**Prompt**

```text
Do Phase 8 from docs/PIVOT_PLAN.md. Add automated tests for pricing, order state machine, idempotency, webhook
signature, refund-once and limits (use the simulation approach already used in this project). Add structured
logging without secrets, error alerts to admin, backups note, rate limits on every public action, a maintenance
mode, a security review of every route and server action (auth, ownership, input validation), and update the README.
Produce docs/LAUNCH_CHECKLIST.md.
```

---

## 9. Working conventions for the new chat

- Read `AGENTS.md`, then the Next.js 16 docs in `node_modules/next/dist/docs/` for anything framework-specific.
- Use **`defineModel()`** for models. Use **server actions** for user actions and **route handlers** for webhooks and
  cron. Authorise in every action with `requireUser()` / `requireAdmin()` (never only in `proxy.ts`).
- Pass **icon names (strings)** from server components to client components. Components cannot be passed across the
  boundary.
- Prefer existing components: `Panel`, `StatCard`, `StatusBadge`, `TableToolbar`, `Pagination`, `ToastForm`,
  `ConfirmAction`, `SettingsRows`, `ImageLightbox`, `DocumentUpload`, `CopyField`, `PaymentTimeline`, `LiveRefresh`.
- Mobile first: tables become stacked cards on phones (`rtable` CSS, `data-label` on cells) and every list row has a
  details button (`MobileDetails`).
- Verify with `npm run lint`, `npx tsc --noEmit`, `npm run build`. Test business logic with **tsx simulation
  scripts** against the real database using throwaway users, and clean up after. Do not click through the site unless
  asked; the owner tests in the browser.
- Prettier formats the code; run `npx prettier --write` on touched folders.
- Put temporary scripts in the scratchpad directory, not in the project. Avoid `rm`; remove files with a small
  script or `git rm`.
- Never ask for or echo secrets. Remind the owner to rotate any key pasted in chat.
- Wording rules: section 3. Plain, specific, calm copy. No hype.

---

## 10. Cost, float and unit economics (for planning)

- **Float:** the money prefunded in provider wallets. Start small (for example the value of a few days of orders).
  Provider balances must be watched; low float means failed orders.
- **Margin:** airtime and data are often a few percent; electricity tokens are thin.
  Set a **minimum margin guard** so no product is sold at or below cost after fees.
- **Fees to subtract:** crypto network and processor fees (NOWPayments), provider fees, FX spread, support time.
- **Refund reserve:** a refund returns the full price to store credit, so margin on failed orders is zero.
- **Breakeven** = fixed costs (hosting, MongoDB, email, support) / average margin per order.

---

## 11. Open questions (answer these in Phase 0)

1. Which country, currency and languages first?
2. Which providers do you already have accounts with? Sandbox keys available?
3. Default markup percent, and minimum margin per order?
4. Order limits and KYC thresholds for tier 0 and tier 1?
5. Guest checkout (email only) or accounts only?
6. Store credit rules: usable on any order, expires or not, withdrawable by request?
7. Who is on the team (admin only, or admin plus staff)? Hours for handling reviews?
8. Will you serve only crypto-paying customers, or add card or bank transfer later?
9. Has your payment processor approved this business model in writing?
10. Legal: who reviews Terms, Privacy and Refund pages, and what registration is needed locally?

---

## 12. Definition of done

- No page, email or metadata mentions returns, plans, profit or yield.
- A customer can buy airtime, data, electricity and cable, pay in crypto, and receive the item.
- Every order is fulfilled at most once, or refunded exactly once.
- The admin can run the whole business from the admin panel (section 5), and a staff role cannot exceed its rights.
- Simulation tests cover pricing, payment events, fulfilment outcomes and refunds.
- Legal pages are reviewed, providers and the payment processor have approved the model, keys are rotated, and the
  launch checklist is complete.
