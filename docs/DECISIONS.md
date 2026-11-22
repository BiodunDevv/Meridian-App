# Meridian decisions

Recorded in Phase 0 of `docs/BUILD_PLAN.md`. Update this file when a decision changes.

## Answered

| Question          | Decision                                                                                                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Country, currency | Nigeria first. Show prices in **NGN and USD** (both supported from the start).                                                                                                                                                                                                                               |
| Providers         | Integrate **VTpass** (airtime, data, electricity, cable). Gift cards are **coming soon**; no gift card provider is chosen yet. Build against the **test/sandbox** environment. Credentials go in `.env.local`. Switching to live must only need a configuration change (mode and keys), with no code change. |
| Default markup    | **5%**, with per-category and per-product overrides.                                                                                                                                                                                                                                                         |
| Guest checkout    | **No.** Accounts only for now. May be revisited after launch.                                                                                                                                                                                                                                                |

## Implications for later phases

- Phase 2: `Provider.mode` (`sandbox` or `live`) selects base URL and keys per provider; nothing else changes between modes.
- Phase 3: read the current official VTpass docs before coding. Note any field-name uncertainty below.
- Money: integer minor units (kobo and cents). The FX rate NGN/USD is admin-set or from a feed with a safety margin.

## Open questions (not yet answered)

These are still open from section 11 of the plan and need an answer before real money is taken.

1. Order limits and KYC thresholds for tier 0 and tier 1.
2. Store credit rules: usable on any order, expiry, withdrawable on request?
3. Team: admin only, or admin plus staff? Hours for handling reviews?
4. Crypto-paying customers only, or card and bank transfer later?
5. Has NOWPayments approved this business model in writing?
6. Legal: who reviews Terms, Privacy and Refund pages, and what registration is needed in Nigeria?
7. Minimum margin per order.
8. Regulatory check (plan rule 10): CBN and SEC guidance for accepting crypto payments and for selling airtime, data, electricity and gift cards; VTpass and Reloadly merchant terms (plan rule 11).

## Ordering rules (Phase 4, placeholders until you decide)

- Ordering is **closed by default**. Open it in Admin > Settings > Ordering only when fulfilment (Phase 5) is ready: until then a paid order stops at "paid" and waits.
- Placeholder limits (all editable in Admin > Settings): $50 per rolling 24 hours with email only, $500 with identity approved, 10 orders per day, 3 unpaid orders open at once, 30-minute payment window. These answer open question 1 only provisionally.
- Orders are paid only with coins NOWPayments can create a fresh address for. The old manual "send and tell us" flow is not used for orders.
- Naira prices need an exchange rate in Admin > Pricing. Without one, naira products refuse to be ordered; nothing is guessed.
- Paying with store credit is **not** built (open question 2).
- A payment that arrives after the window closed, after a cancel, with the wrong price, or short by more than 1% goes to **review**, never to paid.

## Admin and staff (Phase 6)

- Staff permissions: retry, note, resend email, refund to store credit, mark delivered with proof, cancel unpaid, support replies, and
  viewing orders. Everything else is admin only, including crypto refunds, revealing codes and seeing cost and margin.
- A crypto refund refunds to store credit once and then requests a withdrawal through the existing withdrawal flow. The customer must
  be identity verified. If the withdrawal is refused, the money stays as store credit and the order is marked as a crypto refund request.
- Reports count **delivered** orders as revenue, in US dollars; naira orders use the rate they were sold at.
- Not built in Phase 6: price history as its own record (the audit log has every change), per-notification recipient lists, an email
  template editor and legal page versions. Maintenance mode pauses new orders only.

## Fulfilment rules (Phase 5)

- A refusal from the provider that is about us (code 018 low wallet, 030 biller unreachable, 083 system error, 034/035 service suspended, and account or key problems) sends the order to **review** with an admin alert, not to a refund, so a float top-up can still save it. Every other definite refusal refunds to store credit at once.
- A definite refusal is not retried with a new request id automatically (VTpass needs a fresh id dated today). An admin retry arrives in Phase 6.
- Up to 3 sends are allowed, and only when the provider confirms it has no record of the request id. After that with no record, the order is refunded.
- After 6 hours pending or unclear, the order goes to review. After 24 hours with the provider unavailable and nothing sent, the order goes to review.
- Crypto refunds are admin-driven and arrive in Phase 6.

## Provider notes (Phase 3, docs read 2026-11-16)

Sandbox keys: add them to `.env.local` (names in `.env.example`). Live keys use separate `*_LIVE_*` variables, so
switching a provider to live in Admin > Providers needs no code change. Never paste keys into chat; rotate any that were.

### VTpass (airtime, data, electricity, cable TV)

Confirmed from the official pages (authentication, buying services, request id, requery, response codes, balance,
variation codes, airtime, DStv, PHED electricity, transaction update webhook):

- Base URLs: sandbox `https://sandbox.vtpass.com/api`, live `https://vtpass.com/api`.
- GET needs `api-key` + `public-key`. POST needs `api-key` + `secret-key`. API authentication type must be "all" or "API keys".
- Endpoints: `POST /pay`, `POST /requery {request_id}`, `GET /balance` (`contents.balance`, naira), `GET /service-variations?serviceID=`, `POST /merchant-verify`.
- `request_id`: 12+ characters, first 12 are the Africa/Lagos time `YYYYMMDDHHII` of the purchase. Code 085 if wrong, 014 if reused.
  Because of the date rule the id must be made once at the first attempt and stored on the order (`vtpassRequestId`). Requery with the stored id on later days.
- A `000` reply needs `content.transactions.status`: `delivered` is success, `pending` and `initiated` are not final. Codes 099, 089 are pending. 040 and 044, timeouts and odd replies are requeried.
- Sandbox magic numbers (phone, smartcard): `08011111111` success (smartcard `1212121212`), `201000000000` pending, `500000000000` unexpected, `400000000000` no response, `300000000000` timeout, anything else fails. Prepaid test meter `1111111111111`, postpaid `1010101010101`.
- Electricity success reply carries the token in top-level `token` and `purchased_code` ("Token: ...").
- Callbacks (`type: "transaction-update"`) carry **no signature**. We require `?secret=` (`VTPASS_WEBHOOK_SECRET`) in the callback URL, and the caller must confirm with a requery before acting.

Uncertain, check in the sandbox:

- Electricity and TV `serviceID`s other than `portharcourt-electric`, `abuja-electric`, `dstv`, `gotv` came from the docs index and memory. The Aba Power id (`aba-electric`) is a guess.
- Airtime and data **cost**: VTpass pays commission (MTN airtime example 3.5%). The sync assumes no commission (cost = face value), so prices are safe but higher than needed. Lower the "cost %" after reading VTpass's commission page.
- Data variation `variation_amount` is treated as both value and cost for the same reason.
- TV and electricity need a `phone` input; add it to those categories (the seed does).
- Postpaid electricity and StarTimes/Showmax parameters were not read in detail. DStv "renew" (using `Renewal_Amount` from merchant-verify) is not built; only "change" is.
- `merchant-verify` reply field names (`Customer_Name`, `WrongBillersCode`) come from the PHED page.

### Gift cards (coming soon)

No gift card provider is connected. Reloadly was tried first and its sign-up refused the owner's location, so its adapter was
removed. To add gift cards later, choose a provider that serves your country, read its current docs, and write one adapter
file that implements `ProviderAdapter` in `lib/providers/types.ts` (balance, catalogue, validate, purchase, status, webhook). The
order, payment, fulfilment, refund and admin code is provider-neutral, so nothing else needs to change except showing a
`gift-cards` category and a delivery type for card codes.

### Purchase safety (applies to every adapter)

One POST per request id, never retried by the adapter. Timeouts and unclear replies return `unknown`; the caller asks
`status()` and may buy again only when the provider answers `not_found` (`attemptPurchase` and `retryPurchase` in `lib/providers/index.ts`).
Secrets are redacted from anything stored (`lib/providers/redact.ts`).
