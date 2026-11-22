# Launch checklist

Work top to bottom. Do not take real money until every box under **Before real money** is ticked.

## Before real money

### Legal and regulation

- [ ] A lawyer has reviewed the Terms, Privacy, Refund policy and Crypto payment risks pages, and the "draft" notices are removed.
- [ ] Business registration and any licence needed in each country served are in place (for Nigeria, check CBN and SEC guidance
      on accepting crypto payments, and the rules for selling airtime, data, electricity and cable).
- [ ] NOWPayments has approved this business model **in writing**.
- [ ] VTpass has approved the account for live use, and its resale and branding terms have been read.
- [ ] Gift cards are **coming soon**: no provider is connected. Do not show a gift cards category until one is approved and tested.
- [ ] KYC and anti-money-laundering process written down, with who reviews and how fast.

### Accounts, keys and secrets

- [ ] Every key that was ever pasted into a chat or screenshot is regenerated (VTpass keys, NOWPayments keys, Brevo, Cloudinary).
- [ ] Production secrets are set in the host's secret store: `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `MONGODB_URI`, Brevo,
      Cloudinary, NOWPayments (key and IPN secret), VTpass keys, `VTPASS_WEBHOOK_SECRET`. `.env.local` is never committed.
- [ ] `ENCRYPTION_KEY` is backed up somewhere safe. Without it, stored codes and ID numbers cannot be read.
- [ ] `NEXT_PUBLIC_SITE_URL` is the real https address.
- [ ] NOWPayments is in live mode (`NOWPAYMENTS_SANDBOX=false`) and its callback address is `https://YOUR-DOMAIN/api/webhooks/payments`.
- [ ] VTpass: live keys added, the account's API authentication type is "All" or "API keys", your server IP is whitelisted if you
      use IP whitelisting, and its callback URL is `https://YOUR-DOMAIN/api/webhooks/providers/vtpass?secret=VTPASS_WEBHOOK_SECRET`.
- [ ] Brevo sender is verified and the bounce webhook is set to `/api/webhooks/brevo?token=BREVO_WEBHOOK_SECRET`.

### Data and backups

- [ ] MongoDB is on Atlas (or a replica set) so money movements run in transactions. A standalone server is for local work only.
- [ ] Atlas continuous backups (or scheduled snapshots) are on, with a retention you are comfortable with.
- [ ] A restore has been **tested** into a scratch cluster and the app started against it. An untested backup is a hope.
- [ ] Atlas network access allows only the host's addresses (or its private link), not the whole internet.
- [ ] The database user for the app has only the rights it needs.

### Admin settings

- [ ] An admin account exists (`npm run seed`) with a strong password and two-step login on.
- [ ] Every staff account has two-step login on.
- [ ] Admin > Pricing: default markup, minimum margin and the **naira per dollar rate** are set. Naira products cannot be ordered
      without a rate.
- [ ] Admin > Catalogue: products reviewed after a provider sync. Costs checked against your real commission, and prices checked
      against competitors. New synced products arrive hidden.
- [ ] Admin > Providers: VTpass is switched to **live**, low-balance threshold set, and float funded.
- [ ] Admin > Settings > Ordering: limits and the payment window are decided (the defaults are placeholders). Ordering is opened
      only when everything above is done.
- [ ] Admin > Payment methods: the coins and networks you accept are active and test-paid.

### Testing before launch

- [ ] `npm run lint`, `npm run typecheck` and `npm run build` pass.
- [ ] `npm test` and `npm run test:db` pass (the second needs a reachable database in `.env.local`).
- [ ] A full order in the **sandbox**: choose, pay a small test payment, see it paid, see it delivered, view the receipt.
- [ ] A failed order in the sandbox is refunded to store credit once and the customer is emailed.
- [ ] A late payment, an underpayment and a duplicate callback behave as described in `docs/DECISIONS.md`.
- [ ] One small live order with your own money, end to end, before announcing.
- [ ] The site was checked on a phone, in light and dark mode, and installed as an app.

## At launch

- [ ] Vercel cron jobs exist (see `vercel.json`). On the free plan they run once a day. A paid plan can run
      `/api/cron/payments` and `/api/cron/fulfilment` every few minutes, which makes retries faster. Callbacks and page opens do
      the quick work either way.
- [ ] Someone is named to watch the admin overview (needs attention, float) at agreed hours, and to answer support.
- [ ] Admin alert emails reach a mailbox that is read (admin accounts and `ADMIN_EMAIL`).
- [ ] A firewall or bot protection is in front of the site (see `docs/SECURITY_REVIEW.md`).
- [ ] Maintenance mode is understood by everyone on the team (Admin > Settings > Ordering). It pauses new orders only.

## After launch (first weeks)

- [ ] Check Admin > Reconciliation daily: payment differences, underpaid and overpaid orders.
- [ ] Check Admin > Reports weekly: margin by product and provider, refund rate. Raise markup where margin is thin.
- [ ] Watch provider float against order volume and top up before it runs low.
- [ ] Read the audit log for anything unexpected.
- [ ] Re-run the backup restore test every quarter.
- [ ] Review the delivery times you actually achieve, then publish measured numbers on the site in place of "no promise".

## If something goes wrong

- **A provider is down or misbehaving:** switch it off in Admin > Providers (its products disappear from the shop, nothing new is
  sent), or turn on maintenance mode. Orders already sent keep being checked.
- **A payment looks wrong:** open Admin > Reconciliation, run the provider check, and use Sync now. Underpaid and mismatched
  payments wait in review for a person.
- **An order is stuck:** open it, read the timeline, then retry (it asks the provider first, so it cannot double-buy), mark it
  delivered with proof, or refund it.
- **A secret leaked:** regenerate it at the provider, update the host's secret store, redeploy, then read the audit log.
- **Data was lost:** restore from the latest backup into a new cluster, point `MONGODB_URI` at it, and reconcile orders from
  the last hour against the payment and provider dashboards.
