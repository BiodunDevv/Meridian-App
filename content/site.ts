/**
 * Single source of truth for every piece of copy, link and plan on the page.
 * Renaming the brand or editing text should only ever touch this file.
 */

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(
  /\/$/,
  "",
);

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const appLinks = {
  login: `${APP_URL}/login`,
  register: `${APP_URL}/register`,
  /** Builds a register link with optional query values. */
  registerWith: (params: Record<string, string>) =>
    `${APP_URL}/register?${new URLSearchParams(params).toString()}`,
};

export const brand = {
  name: "Meridian",
  tagline: "Invest smarter. See every move.",
  year: 2026,
};

export const seo = {
  title: `${brand.name} | ${brand.tagline}`,
  description:
    "Meridian is an investment platform: fund with crypto, choose a plan and track your portfolio, deposits and withdrawals in one dashboard.",
  ogAlt: `${brand.name}: ${brand.tagline}`,
};

export const disclaimers = {
  hero: "Capital at risk. Projected returns are illustrative.",
  plans:
    "Projected returns are illustrative and not guaranteed. Your capital is at risk.",
  noRealCrypto:
    "Only send the asset on the network shown. Funds sent to the wrong network may be lost.",
  footerRisk:
    "Investing involves risk, including possible loss of capital. Projected returns are illustrative and not guaranteed. Nothing on this site is financial advice.",
  footerBottom: `© ${brand.year} ${brand.name}. All rights reserved.`,
};

export const nav = {
  links: [
    { text: "Features", href: "/#features", id: "features" },
    { text: "How it works", href: "/#how-it-works", id: "how-it-works" },
    { text: "Plans", href: "/#plans", id: "plans" },
    { text: "Security", href: "/#security", id: "security" },
    { text: "FAQ", href: "/#faq", id: "faq" },
  ],
  login: "Log in",
  getStarted: "Get Started",
  skip: "Skip to content",
  menu: "Open navigation menu",
  menuTitle: "Navigation menu",
  themeToggle: "Toggle theme",
};

export const hero = {
  badge: "Fund with crypto · Choose a plan",
  badgeLink: { text: "See how it works", href: "/#how-it-works" },
  titleLine1: "Invest smarter.",
  titleLine2: "See every move.",
  description:
    "Meridian lets you fund your balance with crypto, choose an investment plan, and follow your deposits, growth and withdrawals in one clean dashboard.",
  emailLabel: "Email address",
  emailPlaceholder: "Email address",
  emailError: "Enter a valid email address, for example name@example.com.",
  submit: "Get Started",
  microcopy: disclaimers.hero,
  loginPrompt: "Already have an account?",
  loginLink: "Log in",
  mockupAlt:
    "Sample investor dashboard showing a portfolio value, a growth line chart and the three latest transactions, all with illustrative numbers.",
};

export const assets = {
  title: "Fund your balance with the assets you already hold",
  tickers: [
    "BTC",
    "ETH",
    "USDT",
    "USDC",
    "SOL",
    "BNB",
    "XRP",
    "TON",
    "TRX",
    "DOGE",
    "ADA",
    "AVAX",
    "LTC",
    "DOT",
    "LINK",
    "MATIC",
  ],
  more: "More assets added over time",
  scrollLabel: "Supported assets",
};

export const features = {
  id: "features",
  title: "Everything you need to invest, nothing you don't.",
  items: [
    {
      icon: "LayoutDashboard",
      title: "Clear portfolio overview",
      copy: "Total value, available balance, amount invested and profit or loss, all at a glance.",
    },
    {
      icon: "Wallet",
      title: "Simple crypto deposits",
      copy: "Pick an asset, send to the address shown, and your balance is credited once our team confirms, targeted within the hour.",
    },
    {
      icon: "Layers",
      title: "Plans with open terms",
      copy: "Compare minimum, duration and projected return before you commit a cent.",
    },
    {
      icon: "LineChart",
      title: "Growth you can see",
      copy: "A daily chart shows how your portfolio value builds over time.",
    },
    {
      icon: "Receipt",
      title: "Full transaction history",
      copy: "Every deposit, investment, payout and withdrawal, with a running balance.",
    },
    {
      icon: "Bell",
      title: "Instant notifications",
      copy: "Know when a deposit is confirmed, an investment matures or a withdrawal is paid.",
    },
  ],
};

export const howItWorks = {
  id: "how-it-works",
  title: "From sign-up to payout in four steps",
  steps: [
    {
      title: "Create your account.",
      copy: "Sign up with your email and verify it. Add an authenticator app for extra protection.",
    },
    {
      title: "Fund your balance.",
      copy: "Choose an asset and network, send to the address shown, and tell us you have paid. Our team confirms and credits your balance, targeted within an hour.",
      note: disclaimers.noRealCrypto,
    },
    {
      title: "Pick a plan.",
      copy: "Choose a plan that fits your amount and timeline, and watch your profit accrue daily.",
    },
    {
      title: "Track and withdraw.",
      copy: "Follow every transaction, then request a withdrawal once your identity is verified.",
    },
  ],
};

export const dashboards = {
  id: "dashboards",
  title: "Your portfolio, always in view",
  sampleLabel: "Preview",
  caption:
    "Everything an investor needs: portfolio, plans, deposits, withdrawals and history.",
  sidebar: [
    "Overview",
    "My Portfolio",
    "Investments",
    "Deposit",
    "Withdraw",
    "Transactions",
    "Notifications",
    "Settings",
  ],
  description:
    "Preview of the investor dashboard with a sidebar, portfolio value, available balance, growth chart and recent transactions.",
};

export interface PlanContent {
  slug: string;
  name: string;
  tagline: string;
  minUsd: number;
  maxUsd: number;
  durationDays: number;
  /** Fixed percentage credited every day, compounding on the running balance. */
  dailyPct: number;
  /** Total projected return over the term, derived from dailyPct. Illustrative only. */
  projectedPct: number;
  button: string;
  featured?: boolean;
  badge?: string;
}

/** Total compounded return over a term, rounded to 2 decimals. */
const compoundTotal = (dailyPct: number, days: number) =>
  Math.round(((1 + dailyPct / 100) ** days - 1) * 10000) / 100;

/**
 * Six tiers, smallest to largest. The landing page and `npm run seed` both read this,
 * so the public terms and the app's starting plans always match.
 * After OFFER_AFTER_DAYS in a plan, the app suggests the next tier up.
 */
export const OFFER_AFTER_DAYS = 14;

export const plans = {
  id: "plans",
  title: "Plans that show their terms up front",
  description: "Compare size, term and projected return before you invest.",
  amountLabel: "Amount",
  durationLabel: "Term",
  returnLabel: "Projected return",
  toggle: { total: "Total return", daily: "Per day" },
  lockNote:
    "Compounds daily. Principal and profit are locked until the end date.",
  items: [
    {
      slug: "foundation",
      name: "Foundation",
      tagline: "Your entry point, with a 30-day term.",
      minUsd: 1000,
      maxUsd: 2999,
      durationDays: 30,
      dailyPct: 0.4,
      button: "Start with Foundation",
    },
    {
      slug: "momentum",
      name: "Momentum",
      tagline: "A larger plan over a month and a half.",
      minUsd: 3000,
      maxUsd: 9999,
      durationDays: 45,
      dailyPct: 0.42,
      button: "Start with Momentum",
    },
    {
      slug: "horizon",
      name: "Horizon",
      tagline: "A balanced size and term for steady growth.",
      minUsd: 10000,
      maxUsd: 24999,
      durationDays: 60,
      dailyPct: 0.44,
      button: "Start with Horizon",
      featured: true,
      badge: "Balanced",
    },
    {
      slug: "summit",
      name: "Summit",
      tagline: "For larger positions across a full quarter.",
      minUsd: 25000,
      maxUsd: 49999,
      durationDays: 90,
      dailyPct: 0.46,
      button: "Start with Summit",
    },
    {
      slug: "pinnacle",
      name: "Pinnacle",
      tagline: "A high-value plan with a four-month term.",
      minUsd: 50000,
      maxUsd: 99999,
      durationDays: 120,
      dailyPct: 0.48,
      button: "Start with Pinnacle",
    },
    {
      slug: "apex",
      name: "Apex",
      tagline: "Our top tier for the largest positions.",
      minUsd: 100000,
      maxUsd: 500000,
      durationDays: 180,
      dailyPct: 0.5,
      button: "Start with Apex",
    },
  ].map((p) => ({
    ...p,
    projectedPct: compoundTotal(p.dailyPct, p.durationDays),
  })) as PlanContent[],
  footnote: disclaimers.plans,
};

export const calculator = {
  id: "calculator",
  title: "See how growth could compound",
  amountLabel: "Amount (USD)",
  returnLabel: "Annual return (%)",
  yearsLabel: "Years",
  resultLabel: "Projected final value",
  note: "Illustration only. Not a forecast or a promise.",
  chartAlt: "Line chart of the illustrated balance over the chosen years.",
};

export const security = {
  id: "security",
  title: "Security you can verify",
  items: [
    {
      icon: "ShieldCheck",
      title: "Two-step login",
      copy: "Add an authenticator app and keep one-time recovery codes for emergencies.",
    },
    {
      icon: "Lock",
      title: "Protected credentials",
      copy: "Passwords are hashed, and sensitive fields such as ID numbers are encrypted.",
    },
    {
      icon: "Users",
      title: "Server-side access control",
      copy: "Permissions are enforced on the server, not just hidden in the interface.",
    },
    {
      icon: "MonitorSmartphone",
      title: "Session control",
      copy: "See where you are signed in and sign out any device.",
    },
    {
      icon: "BadgeCheck",
      title: "Identity verification",
      copy: "KYC is required before withdrawals, reviewed by our team.",
    },
    {
      icon: "ScrollText",
      title: "Audit trail",
      copy: "Every action on money, accounts and settings is logged.",
    },
  ],
};

export const stats = {
  id: "at-a-glance",
  title: "At a glance",
  items: [
    { value: "Within 1 hr", label: "Target for confirming a deposit" },
    { value: "3", label: "Investment plans to choose from" },
    { value: "2-step", label: "Authenticator-app login protection" },
    { value: "Every", label: "Money movement recorded in a ledger" },
  ],
};

export const faq = {
  id: "faq",
  title: "Questions, answered plainly",
  items: [
    {
      q: "What is Meridian?",
      a: "Meridian is an investment platform. You fund your balance with crypto, choose a fixed-term plan and follow your deposits, growth and withdrawals in one dashboard.",
    },
    {
      q: "How do deposits work?",
      a: `Choose an asset and network, then send to the wallet address shown. Tell us once you have paid and our team reviews it. When it is confirmed, your balance is credited. ${disclaimers.noRealCrypto}`,
    },
    {
      q: "How long does a deposit take?",
      a: "We aim to confirm deposits within an hour. A person reviews each one, so it can occasionally take longer.",
    },
    {
      q: "Are returns guaranteed?",
      a: "No. Returns shown are projected and illustrative. Investing carries risk, including loss of capital.",
    },
    {
      q: "Why do I need to verify my identity?",
      a: "Identity (KYC) verification is required before your first withdrawal. You submit your details once and our team reviews them.",
    },
    {
      q: "How do withdrawals work?",
      a: "Request a withdrawal to your own wallet address. The amount is held straight away, our team pays it out and records the transaction, and you are notified. If it is rejected, the amount returns to your balance.",
    },
    {
      q: "How is my account protected?",
      a: "Passwords are hashed, sessions can be revoked from your settings, sensitive fields are encrypted, and you can turn on authenticator-app MFA with recovery codes.",
    },
    {
      q: "Which assets can I use?",
      a: "We decide which assets and networks are available, such as BTC, ETH and USDT. You will see the current list when you make a deposit.",
    },
  ],
};

export const cta = {
  title: "Ready to see Meridian in action?",
  description:
    "Create a free account and explore the investor dashboard in minutes.",
  primary: "Create account",
  secondary: "Log in",
};

export const footer = {
  columns: [
    {
      title: "Product",
      links: [
        { text: "Features", href: "/#features" },
        { text: "How it works", href: "/#how-it-works" },
        { text: "Plans", href: "/#plans" },
        { text: "Security", href: "/#security" },
        { text: "FAQ", href: "/#faq" },
      ],
    },
    {
      title: "Account",
      links: [
        { text: "Log in", href: appLinks.login },
        { text: "Create account", href: appLinks.register },
      ],
    },
    {
      title: "Legal",
      links: [
        { text: "Terms of Service", href: "/terms" },
        { text: "Privacy Policy", href: "/privacy" },
        { text: "Risk Disclosure", href: "/risk" },
      ],
    },
  ],
  risk: disclaimers.footerRisk,
  bottom: disclaimers.footerBottom,
};

export interface LegalSection {
  heading: string;
  body: string[];
}

export const legal = {
  back: "Back to home",
  updated: "November 12, 2026",
  updatedLabel: "Last updated",
  pages: {
    terms: {
      title: "Terms of Service",
      intro:
        "These terms govern your use of Meridian. Please read them carefully before creating an account.",
      sections: [
        {
          heading: "1. Acceptance of these terms",
          body: [
            "By creating an account or using Meridian you agree to these Terms of Service, our Privacy Policy and our Risk Disclosure. If you do not agree, do not use the service.",
          ],
        },
        {
          heading: "2. Eligibility and your account",
          body: [
            "You must be at least 18 years old and legally able to enter into a binding agreement. You are responsible for the accuracy of the information you provide and for keeping your login details and authenticator device secure.",
            "You may hold one account. You must tell us promptly if you believe your account has been accessed without your permission.",
          ],
        },
        {
          heading: "3. What Meridian provides",
          body: [
            "Meridian lets you fund a balance with supported cryptocurrency, choose an investment plan with a fixed term, and follow your deposits, plan progress and withdrawals in one dashboard. Supported assets, networks and plans are set by us and may change.",
          ],
        },
        {
          heading: "4. Deposits",
          body: [
            "To deposit, choose an asset and network, send funds to the wallet address shown, then tell us you have paid. Deposits are reviewed by our team and credited to your balance once confirmed. We aim to confirm within about an hour, but a person reviews each deposit and it may take longer.",
            "Only send the asset on the network shown. Funds sent to the wrong network, the wrong address or without a required memo may be lost and cannot be recovered by us.",
          ],
        },
        {
          heading: "5. Investment plans",
          body: [
            "Each plan shows its minimum and maximum amount, its duration and a projected return before you invest. Projected returns are illustrative, not guaranteed, and your capital is at risk. When you start a plan, the amount is deducted from your available balance for the plan's term. When the plan matures, the principal and any profit credited under the plan terms are added to your available balance.",
          ],
        },
        {
          heading: "6. Identity verification and withdrawals",
          body: [
            "We require identity verification (KYC) before your first withdrawal. You must provide accurate, current information and we may ask for more.",
            "When you request a withdrawal, the amount is held immediately. Our team reviews the request and pays it to the wallet address you provided. Payouts to a wrong address that you supplied cannot be reversed. If we reject a request, the held amount returns to your balance.",
          ],
        },
        {
          heading: "7. Acceptable use",
          body: [
            "You agree not to use Meridian for unlawful activity, money laundering, fraud, or to interfere with the service or other users. You must not attempt to access accounts, systems or data that are not yours.",
          ],
        },
        {
          heading: "8. Suspension and closure",
          body: [
            "We may suspend or close an account, delay a transaction or ask for further information where we reasonably suspect a breach of these terms, fraud, a security risk, or where we are required to by law. You may stop using the service at any time and request withdrawal of your available balance, subject to verification.",
          ],
        },
        {
          heading: "9. Risk and no advice",
          body: [
            "Investing involves risk, including possible loss of capital. Nothing on Meridian is financial, investment, legal or tax advice. You are responsible for your own decisions and for any taxes that apply to you.",
          ],
        },
        {
          heading: "10. Limitation of liability",
          body: [
            "To the fullest extent permitted by law, Meridian is not liable for indirect or consequential losses, for losses caused by blockchain network events, third-party outages or events outside our reasonable control, or for losses arising from information or addresses you provide incorrectly. Nothing in these terms limits liability that cannot be limited by law.",
          ],
        },
        {
          heading: "11. Changes to the service and these terms",
          body: [
            "We may update the service and these terms from time to time. When changes are material we will notify you in the app or by email. Continuing to use Meridian after a change takes effect means you accept the updated terms.",
          ],
        },
        {
          heading: "12. Governing law and contact",
          body: [
            "These terms are governed by the laws of the jurisdiction in which Meridian is operated, and disputes are subject to the courts of that jurisdiction unless the law requires otherwise. If you have a question about these terms, contact us through the support channel listed in your account.",
          ],
        },
      ] satisfies LegalSection[],
    },
    privacy: {
      title: "Privacy Policy",
      intro:
        "This policy explains what personal information Meridian collects, why we collect it and the choices you have.",
      sections: [
        {
          heading: "1. Information we collect",
          body: [
            "Account information: your name (if provided), email address and a hashed password.",
            "Verification information: the details you submit for identity (KYC) verification, such as your full name, date of birth, country, address, and ID type and number. ID numbers are stored encrypted.",
            "Transaction information: your deposits, investments, payouts and withdrawals, wallet addresses you provide, and the ledger of your balance.",
            "Technical information: your IP address, browser and device details for security, and the sessions you are signed in on.",
          ],
        },
        {
          heading: "2. How we use your information",
          body: [
            "We use your information to create and secure your account, process deposits and withdrawals, verify your identity, operate your investment plans, send service emails and notifications, prevent fraud and abuse, and meet legal obligations.",
            "To show that the platform is active, we may display recent activity (such as a payout or a confirmed deposit) to other signed-in users in an anonymised form, using a masked username and the amount. We never show names, emails or other details that identify you.",
          ],
        },
        {
          heading: "3. Email",
          body: [
            "We send service emails such as email confirmation, password resets, deposit and withdrawal updates and security notices through a third-party email delivery provider. We do not send marketing email unless you ask for it.",
          ],
        },
        {
          heading: "4. Cookies and analytics",
          body: [
            "Meridian uses a strictly necessary session cookie to keep you signed in. We do not use advertising cookies or third-party analytics on the public pages.",
          ],
        },
        {
          heading: "5. Sharing your information",
          body: [
            "We do not sell your personal information. We share it only with service providers that help us run Meridian (for example hosting, database and email delivery), with authorities where the law requires it, and where needed to protect our users and platform. Providers may only use your information to provide their service to us.",
          ],
        },
        {
          heading: "6. Security",
          body: [
            "Passwords are hashed, sensitive fields are encrypted, sessions can be revoked from your settings, and you can turn on two-step login with an authenticator app. No system is completely secure, so please protect your devices and credentials.",
          ],
        },
        {
          heading: "7. Retention",
          body: [
            "We keep your information while your account is active and for as long as needed to meet legal, accounting and security obligations, after which we delete or anonymise it.",
          ],
        },
        {
          heading: "8. Your rights",
          body: [
            "Depending on where you live, you may have the right to access, correct, export or delete your personal information, and to object to or restrict some processing. To make a request, contact us through the support channel listed in your account. We may need to verify your identity first, and some information must be kept for legal reasons.",
          ],
        },
        {
          heading: "9. Children",
          body: [
            "Meridian is not intended for anyone under 18 and we do not knowingly collect information from children.",
          ],
        },
        {
          heading: "10. Changes to this policy",
          body: [
            "We may update this policy from time to time. We will post the new version here with a new date and notify you of material changes.",
          ],
        },
      ] satisfies LegalSection[],
    },
    risk: {
      title: "Risk Disclosure",
      intro: disclaimers.footerRisk,
      sections: [
        {
          heading: "1. Your capital is at risk",
          body: [
            "The value of your investments can fall as well as rise, and you may lose some or all of the money you put in. Only invest money you can afford to lose.",
          ],
        },
        {
          heading: "2. Projected returns are illustrative",
          body: [
            "Returns shown for each plan are projections for illustration. They are not a forecast or a promise, and actual results may be lower, delayed or nil.",
          ],
        },
        {
          heading: "3. Cryptocurrency risks",
          body: [
            "Crypto assets can be highly volatile. Prices can change sharply and quickly, and transactions on a blockchain are generally irreversible.",
          ],
        },
        {
          heading: "4. Network and address risks",
          body: [
            "Sending an asset on the wrong network, to the wrong address or without a required memo can result in permanent loss. Always double-check the asset, network and address before you send or request a payout.",
          ],
        },
        {
          heading: "5. Timing and availability",
          body: [
            "Deposits and withdrawals are reviewed by people and can take longer than our targets, especially during high demand, maintenance or network congestion.",
          ],
        },
        {
          heading: "6. Platform and counterparty risk",
          body: [
            "Using any online platform involves risks including technical failure, cyber attack, errors and the failure of third parties we rely on. Holdings on Meridian may not be covered by any deposit protection or compensation scheme.",
          ],
        },
        {
          heading: "7. Regulatory and tax",
          body: [
            "Rules about crypto assets and investment products differ by country and can change. You are responsible for knowing whether you may use Meridian where you live and for reporting and paying any taxes that apply.",
          ],
        },
        {
          heading: "8. Not advice",
          body: [
            "Nothing on this site is financial, investment, legal or tax advice. Consider speaking to an independent professional adviser before you invest.",
          ],
        },
      ] satisfies LegalSection[],
    },
  },
};
