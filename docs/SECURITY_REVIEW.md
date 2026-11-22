# Security review

Reviewed route by route and action by action. Each line says who may call it, what protects it, and what was checked.
`npm test` re-checks the access rules automatically (`tests/guards.test.ts` reads the source and fails if any admin page,
admin action or admin route handler loses its guard).

## Rules the code follows

- Authorisation happens in every page, server action and route handler. `proxy.ts` is only a cheap first gate.
- Roles: `admin` (everything), `staff` (orders and support only), customer. The rule is in `lib/auth/permissions.ts`
  and is enforced on pages, in actions, and again inside the order services.
- The browser is never trusted for money: prices are recomputed on the server, and payment and provider callbacks are
  verified and applied through guarded, repeat-safe state changes.
- Secrets live only in the server environment. Logs are scrubbed (`lib/log.ts`). Codes and tokens are encrypted at rest.

## Public routes (no sign-in)

| Route                                                                             | Protection                                               | Notes                                                                                 |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `/`, `/terms`, `/privacy`, `/refunds`, `/risk`, shop pages (`/airtime` and so on) | Read-only                                                | Shop pages show only active products and never cost or margin.                        |
| `/api/me`                                                                         | Limited to 240 requests a minute per address             | Returns only the signed-in person's own name, email and role.                         |
| `POST /api/webhooks/payments`                                                     | HMAC-SHA512 signature, fails closed without the secret   | A finished payment is re-confirmed with the payment provider before an order is paid. |
| `POST /api/webhooks/providers/[key]`                                              | Secret in the URL, fails closed                          | The result is confirmed with the provider's status call before an order changes.      |
| `POST /api/webhooks/brevo`                                                        | Secret in the URL, timing-safe compare, fails closed     | Email bounce and complaint events only.                                               |
| `GET /api/cron/*`                                                                 | `Authorization: Bearer CRON_SECRET`, timing-safe compare | Never callable without the secret.                                                    |
| Sign-up, log in, password reset, email confirm actions                            | Rate limited by address and by account                   | Same answer whether an email exists or not.                                           |
| `quoteOrderAction`                                                                | Limited to 120 requests per 5 minutes per address        | Returns a price only, never cost.                                                     |

## Customer actions (signed in, verified email, active account)

Every action starts with `requireUser()`. Ownership is checked in the query (`userId` is part of the filter), not after.

- Orders: create (rate limited, idempotent, limits, KYC gate, ordering switch), cancel (own, unpaid only), reveal code
  (own, delivered only, audited, view-once option).
- Support: create (limited, only your own order can be linked), reply (own ticket only), close (own ticket only).
- Identity: submit (limited), upload signature (limited). Photos go to private storage and are streamed to admins only.
- Account: change password (limited, needs the current password), two-step login (limited), sessions, push, username.

## Admin and staff

- Every admin page calls `requireAdmin()` itself, except the five pages staff may use (overview, orders, order detail,
  support, ticket), which call `requireStaff()` with a permission.
- Every admin action calls `requireAdmin()`, except the order and support actions, which call `requireStaff(permission)`.
- Crypto refunds, revealing a code, cost and margin, pricing, providers, catalogue, settings, users and the money queues are
  admin only, and the order services check the permission again.
- Admin exports: orders for staff and admins, every other table for admins only. The export is written to the audit log.
- Every admin action writes an audit entry with the person's email.

## Money and fulfilment

- A paid order is placed with a provider once, by an atomic claim plus a lease, and the "sent" marker is written before
  the first send. After a crash the order is only asked about.
- A refund is one transaction that moves the order and credits the ledger, guarded by "no refund recorded yet", so it
  happens once however many times it is tried.
- Payment amounts are checked three ways: full amount received, price matches the order, and the provider's own record.
  Anything else goes to review, never to paid.

## Headers and browser protections

Set in `next.config.mjs`: a baseline content security policy (self only, plus the identity photo host), `nosniff`, no
framing, a strict referrer policy, a restrictive permissions policy and HSTS. The policy still allows inline scripts that
Next.js needs; moving to a nonce-based policy is a recommended next step.

## Known limits and recommendations

- The client address comes from `x-forwarded-for`. That is correct on Vercel (the platform sets it). Behind another proxy,
  make sure the proxy overwrites it, or rate limits by address can be sidestepped.
- Rate limits are fixed windows in the database. They stop abuse and guessing, not a determined distributed attack. Put a
  firewall or bot protection in front for launch.
- Two-step login is optional. Require it for every admin and staff account.
- Provider callbacks that carry only a URL secret (VTpass) are treated as hints and confirmed with a status call.
