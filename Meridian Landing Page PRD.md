# Apexvest Landing Page: PRD

Nov 12, 2026 · @Muhammed Abiodun

## Overview and goals

Apexvest needs one marketing page that explains the platform in under a minute and sends visitors to create an account or log in. It is the public front door to the investor and admin dashboards, and it must look like a Launch UI site: light, blue-accented, spacious and typographically bold.

**Goals**

1. Explain what Apexvest does on the first screen: fund with crypto, pick a plan, track growth.
2. Convert visitors. The primary action is "Get Started" (email, then registration); the secondary action is "Log in".
3. Build trust honestly by showing real platform capabilities (MFA, KYC, audit trail) and stating plainly that this is a demo with simulated funds.
4. Reuse Launch UI components so the page is fast to build and easy to restyle.

**Success measures**

| Measure | Target |
| --- | --- |
| Lighthouse on mobile: Performance / Accessibility / Best Practices / SEO | ≥ 90 / ≥ 95 / ≥ 95 / ≥ 95 |
| Largest Contentful Paint | < 2.5 s on a 4G connection |
| Cumulative Layout Shift | < 0.1 |
| A visitor can say what Apexvest does after reading only the hero | Yes, checked with 3 people |
| Hero email form reaches /register with the email prefilled | Works on mobile and desktop |

## Product context

Apexvest is an investment platform where people fund an account with cryptocurrency and invest in fixed-term plans. **In its current form it is a demo:** wallet addresses are set by the administrator, deposits are confirmed by hand, balances are credited by an admin, and no payment provider or real market is involved. The landing page must never suggest otherwise.

**What the platform does (facts the page may state)**

| Area | Fact |
| --- | --- |
| Accounts | Email and password sign-up, email verification, optional authenticator-app MFA with recovery codes |
| Funding | The user picks an asset and network, sends to an admin-managed address, and the balance is credited after an admin confirms. Target: within about an hour |
| Plans | Fixed-term plans with a minimum, maximum, duration and projected return |
| Portfolio | Total value, available balance, total invested, profit or loss, growth chart |
| Withdrawals | Requested by the user, reviewed and paid by an admin; identity (KYC) verification required |
| Transparency | Transaction history with a running balance; notifications on every status change |
| Admin | User management, deposit and withdrawal queues, plans, wallet addresses, settings, audit log |

**Honesty rules for all copy**

- Say that funds are simulated wherever money, returns or deposits are mentioned.
- No guaranteed, fixed or "risk-free" returns. Returns are always "projected" and "illustrative".
- No invented testimonials, user counts, awards, press logos or regulator badges.
- Show only numbers that come from the platform itself (see the stats strip in the section specs).

## Audience

Four kinds of visitor reach the page, and most will arrive on a phone. Copy is in English and amounts are shown in USD.

| Visitor | Wants | The page must show |
| --- | --- | --- |
| First-time investor | Simplicity and to know what happens to their money | Plain-language steps, plan terms, clear risk wording |
| Crypto-comfortable user | To fund with assets they already hold | Supported assets, the deposit flow, the confirmation time |
| Reviewer or client judging the demo | To see the whole product quickly | Previews of both dashboards, an FAQ that says it is a demo |
| Returning user | To log in fast | A Log in link that is always visible in the navbar |

## Design direction

Match the Launch UI look in the reference screenshot: a light, airy page with a huge, tightly set bold headline, grey supporting text, one blue accent, a soft blue glow arc rising behind the hero, and faint dashed vertical guide lines framing the content column. Use Launch UI's blue theme (the highlighted swatch in its customizer), light mode by default, with dark mode available.

**Signature details to reproduce**

- Slim top navbar: logo plus a small pill badge ("Demo" in place of Launch UI's version pill), text links beside it, icon buttons on the right.
- Hero: centred two-line H1, bold with tight tracking; muted subheading no wider than about 60 characters per line; an inline email field with a blue button; small grey microcopy underneath.
- A blue arc or radial glow under the hero that fades into the background; the product mockup overlaps it.
- Dashed 1px vertical lines at the left and right edges of the content container, full page height, desktop only.
- Generous vertical rhythm: 96 to 160 px between sections, content width capped at Launch UI's container (about 1200 px).
- Cards with a 1px border, a very soft shadow and a small radius. No heavy gradients except the primary button and the glow.
- Lucide icons, 20 to 24 px, stroke 1.5 to 2.

**Design tokens, light mode** (approximated from the screenshot; if Launch UI's own theme variables differ, prefer Launch UI's)

| Token | Value | Use |
| --- | --- | --- |
| Background | #F7F9FC | Page |
| Foreground | #0A0A0B | Headings, body |
| Muted text | #6B7280 | Subheads, microcopy |
| Card | #FFFFFF | Cards, mockup |
| Border | #E5E7EB | Cards, inputs |
| Guide lines | #D1D5DB, dashed | Vertical gutter lines |
| Input fill | #E8ECF2 | Hero email field |
| Primary | #2563EB | Buttons, links, key icons |
| Primary gradient | #3B82F6 to #2563EB | Primary button |
| Primary hover | #1D4ED8 | Button hover |
| Glow | #93C5FD at 40% opacity | Hero arc |
| Success / Danger | #16A34A / #DC2626 | Status chips only |

**Dark mode:** background #09090B, card #111113, border #27272A, foreground #FAFAFA, muted #A1A1AA. Keep the same blue; use #3B82F6 for blue text and links so contrast holds.

**Typography and shape**

- Font: Inter, loaded with next/font.
- H1: weight 700, clamp(2.75rem, 7vw, 5.5rem), line-height 1.05, letter-spacing -0.03em. H2: weight 600, clamp(2rem, 4vw, 3rem). Body 16 to 18 px; hero subheading 18 to 20 px.
- Radius: 6 px on buttons and inputs, 12 px on cards. The look is crisp, not pill-shaped.
- Motion: a 300 ms fade-up as sections enter, CSS only, switched off under prefers-reduced-motion.

## Page structure

The page is a single scroll with 13 sections in this order. Use the nearest Launch UI block for each; where none exists, build it from shadcn/ui primitives in the same style. There is deliberately no testimonials section, because there are no real customers to quote.

| # | Section | Launch UI block | Job |
| --- | --- | --- | --- |
| 1 | Navbar | Navbar | Navigation, Log in, Get Started |
| 2 | Hero | Hero + Mockup + Glow | Say what Apexvest is; capture the email |
| 3 | Supported assets | Logos | Show which assets can fund a balance |
| 4 | Features | Items | Six reasons to use the platform |
| 5 | How it works | Items or Section (numbered) | Four steps from sign-up to withdrawal |
| 6 | Dashboards | Mockup with Tabs | Show the investor and admin sides |
| 7 | Investment plans | Pricing | Compare the three plans and their terms |
| 8 | Growth calculator (optional) | Custom | Let visitors try amounts and durations |
| 9 | Security | Items | Prove the safeguards that actually exist |
| 10 | At a glance | Stats | Four facts taken from the platform |
| 11 | FAQ | FAQ | Answer risk, timing and demo questions |
| 12 | Final call to action | CTA | Last prompt to register |
| 13 | Footer | Footer | Links, legal, risk disclosure |

## Section specs

All copy below is final unless marked otherwise. Keep it in one content file so it can be edited without touching components.

### 1. Navbar

- Left: logo (a simple peak mark in blue plus the wordmark "Apexvest") and a small outlined pill reading "Demo".
- Centre links: Features, How it works, Plans, Security, FAQ. They scroll smoothly to the section and highlight while it is in view.
- Right: theme toggle (sun/moon), "Log in" (ghost button), "Get Started" (primary button).
- Sticky, with a blurred translucent background and a 1px bottom border that appears after scrolling 8 px.
- Mobile: logo, then a menu button that opens a right-hand sheet with the links and both buttons.

### 2. Hero

- Badge above the headline: "Demo platform · simulated funds" with an arrow link "See how it works" that scrolls to section 5.
- H1, two lines: **"Invest smarter."** / **"See every move."**
- Subheading: "Apexvest lets you fund your balance with crypto, choose an investment plan, and follow your deposits, growth and withdrawals in one clean dashboard."
- Form: email input (placeholder "Email address") and a primary button "Get Started", side by side on desktop and stacked on mobile. Submitting goes to {APP\_URL}/register?email=\<value>. Validate the email on the client and show an inline error.
- Microcopy below: "Demo environment. Funds are simulated and no real money moves."
- Secondary text link under it: "Already have an account? Log in".
- Below the form: a dashboard mockup (built in React and Tailwind, not an image) showing the portfolio value, a growth line chart and the last three transactions with made-up demo numbers. It sits on the blue glow arc and is cropped at the bottom of the first viewport on desktop.

### 3. Supported assets

- Small centred heading: "Fund your balance with the assets you already hold".
- A row of badges, each a circle with the ticker: BTC, ETH, USDT, USDC, plus "More added by the admin". Use plain ticker badges, not real brand logos.
- On mobile the row becomes a horizontally scrolling strip.

### 4. Features

Heading: "Everything you need to invest, nothing you don't." Six cards in a 3 by 2 grid (2 by 3 on tablet, one column on mobile), each with an icon, a title and one sentence.

| Icon | Title | Copy |
| --- | --- | --- |
| LayoutDashboard | Clear portfolio overview | Total value, available balance, amount invested and profit or loss, all at a glance. |
| Wallet | Simple crypto deposits | Pick an asset, send to the address shown, and your balance is credited once an admin confirms, targeted within the hour. |
| Layers | Plans with open terms | Compare minimum, duration and projected return before you commit a cent. |
| LineChart | Growth you can see | A daily chart shows how your portfolio value builds over time. |
| Receipt | Full transaction history | Every deposit, investment, payout and withdrawal, with a running balance. |
| Bell | Instant notifications | Know when a deposit is confirmed, an investment matures or a withdrawal is paid. |

### 5. How it works

Heading: "From sign-up to payout in four steps". A horizontal four-step row on desktop (connected by a dashed line), a vertical list on mobile.

1. **Create your account.** Sign up with your email and verify it. Add an authenticator app for extra protection.
2. **Fund your balance.** Choose an asset and network, send to the address shown, and tell us you have paid. An admin confirms and credits your balance, targeted within an hour. Small grey note under this step: "Do not send real cryptocurrency to demo addresses."
3. **Pick a plan.** Choose a plan that fits your amount and timeline, and watch your profit accrue daily.
4. **Track and withdraw.** Follow every transaction, then request a withdrawal once your identity is verified.

### 6. Dashboards

Heading: "One platform, two dashboards". Two tabs, "Investor" and "Admin", each showing a React-built mockup with a small "Sample data" label.

- **Investor tab:** sidebar with Overview, My Portfolio, Investments, Deposit, Withdraw, Transactions, Notifications, Settings; main area with the portfolio value, available balance, growth chart and recent transactions. Caption: "Everything an investor needs: portfolio, plans, deposits, withdrawals and history."
- **Admin tab:** sidebar with Overview, Users, Investments, Deposits, Withdrawals, Transactions, Settings; main area with total users, verified users, total deposits, total withdrawals and a pending-deposits queue with Approve and Reject buttons. Caption: "Everything an operator needs: review deposits, pay withdrawals, manage users, plans and wallet addresses."

### 7. Investment plans

Heading: "Plans that show their terms up front". Subheading: "Compare size, duration and projected return before you invest." Three cards, with the middle one outlined in blue and carrying a "Balanced" badge. Values come from the content file and mirror the backend's demo seed.

| Plan | Tagline | Amount | Duration | Projected return (illustrative) | Button |
| --- | --- | --- | --- | --- | --- |
| Starter | Short-term plan for first-time investors | $50 to $999 | 7 days | 5% | Start with Starter |
| Growth | Balanced plan with a 30-day term | $1,000 to $9,999 | 30 days | 15% | Start with Growth |
| Premium | Larger tickets over 90 days | $10,000 to $100,000 | 90 days | 50% | Start with Premium |

Each button goes to {APP\_URL}/register?plan=\<slug>. Footnote under the cards, exactly: "Projected returns are illustrative, not guaranteed. Your capital is at risk. Demo environment with simulated funds."

### 8. Growth calculator (optional, build last)

The owner said this is not essential, so treat it as a stretch item. If built: heading "See how growth could compound"; three inputs (amount in USD, annual return in %, years); an output card with the projected final value and a small line chart; computed in the browser with A = P × (1 + r)^t. Label it "Illustration only. Not a forecast or a promise."

### 9. Security

Heading: "Security you can verify". Six items in a 3 by 2 grid.

| Icon | Title | Copy |
| --- | --- | --- |
| ShieldCheck | Two-step login | Add an authenticator app and keep one-time recovery codes for emergencies. |
| Lock | Protected credentials | Passwords are hashed, and sensitive fields such as ID numbers are encrypted. |
| Users | Role-based access | Investor and admin permissions are enforced on the server, not just hidden in the interface. |
| MonitorSmartphone | Session control | See where you are signed in and sign out any device. |
| BadgeCheck | Identity verification | KYC is required before withdrawals, reviewed by an administrator. |
| ScrollText | Audit trail | Every admin action on money, users and settings is logged. |

### 10. At a glance

A four-column stats strip. Only these facts, because each is true of the platform.

| Value | Label |
| --- | --- |
| Within 1 hr | Target for confirming a deposit |
| 3 | Investment plans to choose from |
| 2-step | Authenticator-app login protection |
| Every | Money movement recorded in a ledger |

### 11. FAQ

Heading: "Questions, answered plainly". An accordion, first item open.

| Question | Answer |
| --- | --- |
| Is Apexvest using real money? | No. Apexvest is a demo. Deposits are confirmed manually by an administrator and balances are simulated. Please do not send real cryptocurrency to any address shown in the demo. |
| How do deposits work? | Choose an asset and network, then send to the wallet address shown. Tell us once you have paid and an administrator reviews it. When it is confirmed, your balance is credited. |
| How long does a deposit take? | We aim to confirm deposits within an hour. A person reviews each one, so it can occasionally take longer. |
| Are returns guaranteed? | No. Returns shown are projected and illustrative. Investing carries risk, including loss of capital. |
| Why do I need to verify my identity? | Identity (KYC) verification is required before your first withdrawal. You submit your details once and an administrator reviews them. |
| How do withdrawals work? | Request a withdrawal to your own wallet address. The amount is held straight away, an administrator pays it out and records the transaction, and you are notified. If it is rejected, the amount returns to your balance. |
| How is my account protected? | Passwords are hashed, sessions can be revoked from your settings, sensitive fields are encrypted, and you can turn on authenticator-app MFA with recovery codes. |
| Which assets can I use? | The administrator decides which assets and networks are available, such as BTC, ETH and USDT. You will see the current list when you make a deposit. |

### 12. Final call to action

A full-width card with the blue glow. Heading: "Ready to see Apexvest in action?" Subheading: "Create a free demo account and explore the investor dashboard in minutes." Buttons: "Create account" (primary) and "Log in" (outline).

### 13. Footer

- Columns: **Product** (Features, How it works, Plans, Security, FAQ), **Account** (Log in, Create account), **Legal** (Terms of Service, Privacy Policy, Risk Disclosure).
- Bottom row: "© 2026 Apexvest. Demo platform with simulated funds." and the theme toggle.
- Risk line above the bottom row, exactly: "Investing involves risk, including possible loss of capital. Projected returns are illustrative and not guaranteed. Nothing on this site is financial advice."

## Trust, risk and compliance wording

The site talks about deposits and returns, so the rules below are mandatory. This is product guidance, not legal advice.

| Rule | Requirement |
| --- | --- |
| Demo label | Show the "Demo" pill in the navbar and the line "Demo environment. Funds are simulated." in the hero, the plans section and the footer. |
| No real deposits | Wherever a wallet address or deposit is described, add: "Do not send real cryptocurrency to demo addresses." Put it in the FAQ and as a small grey note under step 2 of How it works. |
| Banned words | "Guaranteed", "risk-free", "no risk", "double your money", "fixed profit", "passive income" and "get rich" never appear anywhere. |
| Returns | Always called "projected" or "illustrative", and always shown beside the risk line. |
| No fabrication | No testimonials, user counts, awards, "as seen in" logos or regulator badges. |
| Risk disclosure | The footer carries the exact risk line given in the footer spec. |
| Legal pages | /terms, /privacy and /risk exist as simple pages. Placeholder text is acceptable for the demo if each page says it is a placeholder. |
| If it ever goes live | Real funds, real returns or real customers need legal review and the right registration in the country of operation before launch, and all copy must be rewritten. Do not reuse the demo page for that. |

## Technical requirements

Build a Next.js site that uses Launch UI components, with no paid services.

| Area | Choice |
| --- | --- |
| Framework | Next.js App Router, TypeScript, React 19 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui plus Launch UI blocks |
| Icons | lucide-react |
| Theming | next-themes, class strategy, default light |
| Font | Inter via next/font |
| Animation | CSS only |
| Hosting | Vercel free tier or any static host |

Launch UI is open source (MIT) and is published as a shadcn registry at launchuicomponents.com. Install each block with the shadcn CLI command shown on its component page, or start from the [launch-ui GitHub template](https://github.com/launch-ui/launch-ui). Version 2 targets Tailwind v4 and React 19. Check each component page for its exact install command rather than guessing it.

**Suggested file structure**

```text
app/
  layout.tsx            fonts, ThemeProvider, metadata
  page.tsx              composes the 13 sections in order
  opengraph-image.tsx   social card
  sitemap.ts, robots.ts
  terms/ privacy/ risk/ simple legal pages
components/
  sections/             navbar, hero, assets, features, how-it-works,
                        dashboards, plans, calculator, security, stats,
                        faq, cta, footer
  mockups/              investor-dashboard.tsx, admin-dashboard.tsx
  ui/                   shadcn and Launch UI primitives
content/
  site.ts               brand name, nav links, all copy, plans, FAQ, footer links
lib/
  utils.ts
```

**Rules**

- Server components by default. Client components only for the navbar scroll state, theme toggle, hero form, tabs and calculator.
- Every link to the product app uses NEXT\_PUBLIC\_APP\_URL (for example {APP\_URL}/login and {APP\_URL}/register), so the landing page and the app can live on different domains.
- The brand name and every piece of copy come from content/site.ts, so renaming the product is a one-file change.
- Dashboard mockups are React components with hard-coded demo data, not screenshots.
- No theme flash on load: use suppressHydrationWarning on the html element and the class strategy.
- No external image hosts; use SVG and CSS for all graphics.

Sources: [Launch UI on GitHub](https://github.com/launch-ui/launch-ui), [Launch UI components](https://www.launchuicomponents.com).

## Responsive, accessibility, performance and SEO

**Responsive layout**

| Width | Layout |
| --- | --- |
| Under 640 px (mobile) | One column, stacked hero form, menu in a sheet, 16 px side padding |
| 640 to 1023 px (tablet) | Two-column grids, menu still in a sheet |
| 1024 px and up (desktop) | Full navbar, three-column grids, dashed guide lines |
| 1536 px and up | Content stays capped at about 1200 px, centred |

**Accessibility (WCAG 2.2 AA)**

- Text contrast of at least 4.5:1 in both themes. Check white text on the blue button and the muted grey on the page background; if the grey falls short, darken it to #5B6472.
- Visible focus rings (2 px blue with an offset) on every interactive element.
- A skip-to-content link, a keyboard-operable accordion and tabs, and a mobile sheet that traps focus.
- Landmarks (header, nav, main, footer), one H1, and each section labelled with aria-labelledby.
- The hero email field has a real label (visually hidden) and errors are announced with aria-live.
- Decorative icons and the dashboard mockups are aria-hidden; give each mockup a one-sentence text description.
- Touch targets of at least 44 px; no autoplaying motion; animations off under prefers-reduced-motion.

**Performance**

- The Largest Contentful Paint element is the H1 text, so there is no hero image to wait for.
- First-load JavaScript under 170 kB gzipped. Lazy-load the dashboards tabs and the calculator below the fold.
- Fonts through next/font with display swap; no layout shift from fonts, the theme or the mockups.

**SEO**

- Title: "Apexvest | Invest smarter. See every move."
- Meta description: "Apexvest is a demo investment platform: fund with crypto, choose a plan and track your portfolio, deposits and withdrawals in one dashboard."
- Open Graph and Twitter card image (1200 by 630) showing the name, the tagline and the blue glow, generated with opengraph-image.tsx.
- lang="en", canonical URL, sitemap.xml and robots.txt, and WebSite structured data.

## Acceptance criteria

The page is done when every box below can be ticked.

- [ ] The 12 required sections appear in the specified order (the calculator is optional).
- [ ] Light mode is the default; dark mode works with no flash on load.
- [ ] The look matches Launch UI's blue theme: bold centred hero, blue glow arc, dashed guide lines on desktop.
- [ ] The hero form validates the email and goes to {APP\_URL}/register?email=\<value>.
- [ ] Every Log in, Get Started and Create account link uses NEXT\_PUBLIC\_APP\_URL.
- [ ] The "Demo" pill, hero microcopy, plans footnote and footer risk line appear word for word.
- [ ] None of the banned words appears anywhere in the built HTML (search it).
- [ ] There are no testimonials, invented counts, awards or logos.
- [ ] Plan cards read from content/site.ts and match the spec.
- [ ] The FAQ accordion, dashboards tabs and mobile menu work by keyboard alone.
- [ ] No horizontal scroll at 360, 768, 1024 and 1440 px.
- [ ] Lighthouse mobile scores meet the targets in the overview.
- [ ] Contrast checks pass for the blue button text and the muted text in both themes.
- [ ] Renaming the product means editing content/site.ts only.
- [ ] npm run build and the linter finish with no errors.
- [ ] No paid service and no external image host is used.

## Out of scope and open questions

**Out of scope for this page:** sign-up, login and the dashboards (they live in the app), the backend, real payments or wallets, a blog or CMS, multiple languages, a cookie banner and analytics, and live data from the API.

**Open questions**

| Question | Why it matters | Default if unanswered |
| --- | --- | --- |
| The Premium plan shows 50% projected over 90 days. Keep it? | A figure that high reads like a high-yield promise to visitors | Show it with the "illustrative" label, and consider lowering the demo seed values or hiding percentages on the page |
| Where will the app live (domain or port)? | Every call-to-action link depends on it | NEXT\_PUBLIC\_APP\_URL=http://localhost:3001 |
| Is there a logo? | Navbar, favicon and social card | A blue Lucide Mountain icon plus the wordmark |
| Build the calculator? | Extra build time for a non-essential feature | Skip it in version 1 |
| Who writes the Terms, Privacy and Risk pages? | The footer links need real targets | Placeholder pages that say they are placeholders |
| Has the name Apexvest been checked for domain and trademark clashes? | Avoids a rename after launch | Check before buying a domain |
