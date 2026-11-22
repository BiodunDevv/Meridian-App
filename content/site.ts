/**
 * Single source of truth for every piece of copy and link on the page.
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
  tagline: "Spend your crypto on everyday bills.",
  year: 2026,
};

export const seo = {
  title: `${brand.name} | ${brand.tagline}`,
  description:
    "Meridian lets you pay for airtime, data, electricity and cable TV with crypto. Prices are shown in naira and US dollars.",
  ogAlt: `${brand.name}: ${brand.tagline}`,
};

export const disclaimers = {
  hero: "Crypto payments are final once confirmed on the network.",
  noRealCrypto:
    "Only send the asset on the network shown. Funds sent to the wrong network may be lost.",
  footerRisk:
    "Crypto payments are final once confirmed on the network, and prices can move between quote and payment. Nothing on this site is financial advice.",
  footerBottom: `© ${brand.year} ${brand.name}. All rights reserved.`,
};

export const nav = {
  links: [
    { text: "What we sell", href: "/#features", id: "features" },
    { text: "How it works", href: "/#how-it-works", id: "how-it-works" },
    { text: "Delivery and refunds", href: "/#delivery", id: "delivery" },
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
  badge: "Pay with crypto",
  badgeLink: { text: "See how it works", href: "/#how-it-works" },
  titleLine1: "Spend your crypto",
  titleLine2: "on everyday bills.",
  description:
    "Pay for airtime, data, electricity and cable TV with crypto. Create an account, secure it, and order in a few taps.",
  emailLabel: "Email address",
  emailPlaceholder: "Email address",
  emailError: "Enter a valid email address, for example name@example.com.",
  submit: "Get Started",
  microcopy: disclaimers.hero,
  loginPrompt: "Already have an account?",
  loginLink: "Log in",
  mockupAlt:
    "An example order page showing four steps: order created, awaiting payment, payment confirmed and delivered. It is an illustration, not a real order.",
};

export const assets = {
  title: "Pay with the crypto you already hold",
  tickers: [
    "USDT",
    "USDC",
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "TRX",
    "XRP",
    "TON",
    "DOGE",
    "LTC",
  ],
  more: "Final list shown at checkout",
  scrollLabel: "Coins we expect to accept",
};

export const features = {
  id: "features",
  title: "What you can buy",
  items: [
    {
      icon: "Smartphone",
      title: "Airtime",
      copy: "Top up a phone number on the major Nigerian networks.",
    },
    {
      icon: "Wifi",
      title: "Data bundles",
      copy: "Choose a data bundle for any supported number.",
    },
    {
      icon: "Zap",
      title: "Electricity",
      copy: "Prepaid and postpaid meter payments. The token appears on your order page.",
    },
    {
      icon: "Tv",
      title: "Cable TV",
      copy: "Renew a subscription with your smartcard number.",
    },
    {
      icon: "Gift",
      title: "Gift cards",
      copy: "Coming soon. Gift cards from popular brands, paid for with crypto.",
    },
    {
      icon: "Receipt",
      title: "Clear receipts",
      copy: "Every order has its own price, payment and status, so you can see what happened.",
    },
  ],
  note: "Which products are available depends on our providers. The shop pages list what is on sale now.",
};

export const howItWorks = {
  id: "how-it-works",
  title: "How ordering works",
  steps: [
    {
      title: "Choose what you need.",
      copy: "Pick airtime, data, electricity or cable TV and enter the details. The price is shown in naira and US dollars.",
    },
    {
      title: "Pay with crypto.",
      copy: "Each order gets its own payment request for the exact amount. The rate is locked for a short window.",
      note: disclaimers.noRealCrypto,
    },
    {
      title: "We place the order.",
      copy: "Once your payment is confirmed on the network, we buy the item from our provider.",
    },
    {
      title: "Receive it.",
      copy: "You see the result on your order page and by email. Delivery time depends on the item and the provider. If we cannot deliver, you get a refund as store credit.",
    },
  ],
};

export const policies = {
  id: "delivery",
  title: "Delivery and refunds, stated plainly",
  delivery: {
    title: "How long delivery takes",
    intro:
      "We do not promise a delivery time. It depends on the item, our provider and the network. Each order page shows its current status.",
    rows: [
      ["Airtime and data", "Usually quick once your payment is confirmed."],
      [
        "Cable TV",
        "Usually quick, but can take longer if the provider is slow.",
      ],
      [
        "Electricity",
        "The token is shown on your order page when the provider returns it.",
      ],
    ],
    outro:
      "We will publish measured delivery times after we have fulfilled real orders.",
  },
  refunds: {
    title: "If we cannot deliver",
    points: [
      "If you paid and we cannot deliver the order, you get a refund as store credit on your account.",
      "Where we offer it, you can ask for a crypto refund instead. This is decided case by case.",
      "Crypto payments are final once confirmed on the network. A wrong phone, meter or smartcard number you entered cannot be reversed once delivered.",
      "If you underpay, the order is held for review and is not delivered until it is resolved.",
    ],
    link: { text: "Read the refund policy (draft)", href: "/refunds" },
  },
  support: {
    title: "Need help?",
    copy: "Open a support ticket from your account. Each ticket can be linked to an order so we can see what happened.",
    cta: "Create an account to contact support",
  },
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
      copy: "Identity checks raise your limits and are reviewed by our team.",
    },
    {
      icon: "ScrollText",
      title: "Audit trail",
      copy: "Every action on money, accounts and settings is logged.",
    },
  ],
};

export const faq = {
  id: "faq",
  title: "Questions, answered plainly",
  items: [
    {
      q: "What is Meridian?",
      a: "Meridian lets you pay for everyday bills with crypto. We buy the item from a provider and deliver it to you. We keep a small markup on the price.",
    },
    {
      q: "Do you sell gift cards?",
      a: "Not yet. Gift cards are coming soon. Airtime, data, electricity and cable TV are what we sell today.",
    },
    {
      q: "How do I order?",
      a: "Create an account, open a shop page such as airtime or data, choose what you want and pay with crypto. If ordering is paused, the shop page says so.",
    },
    {
      q: "Which currencies are prices shown in?",
      a: "Nigerian naira and US dollars. The crypto amount is quoted when you start a payment, and the rate is locked for a short window.",
    },
    {
      q: "Are crypto payments reversible?",
      a: "No. A payment is final once it is confirmed on the network. Send only the asset and network shown, to the address shown.",
    },
    {
      q: "What if an order cannot be delivered?",
      a: "If we cannot deliver an order you have paid for, the amount is refunded as store credit. Where we offer it, you can ask for a crypto refund instead.",
    },
    {
      q: "Why do I need to verify my identity?",
      a: "Identity (KYC) verification raises your order limits. You submit your details once and our team reviews them.",
    },
    {
      q: "How is my account protected?",
      a: "Passwords are hashed, sessions can be revoked from your settings, sensitive fields are encrypted, and you can turn on authenticator-app two-step login with recovery codes.",
    },
  ],
};

export const cta = {
  title: "Ready when you are",
  description:
    "Create a free account, turn on two-step login and verify your identity to raise your limits.",
  primary: "Create account",
  secondary: "Log in",
};

export const footer = {
  columns: [
    {
      title: "Product",
      links: [
        { text: "What we sell", href: "/#features" },
        { text: "How it works", href: "/#how-it-works" },
        { text: "Delivery and refunds", href: "/#delivery" },
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
        { text: "Refund policy", href: "/refunds" },
        { text: "Crypto payment risks", href: "/risk" },
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
  updated: "November 16, 2026",
  updatedLabel: "Last updated",
  draftNotice:
    "Draft for legal review. This page has not yet been reviewed by a lawyer and must be before launch.",
  pages: {
    terms: {
      title: "Terms of Service",
      intro:
        "Draft for legal review. These terms describe how Meridian works. Please read them before creating an account.",
      sections: [
        {
          heading: "1. Acceptance of these terms",
          body: [
            "By creating an account or using Meridian you agree to these Terms of Service and our Privacy Policy. If you do not agree, do not use the service.",
          ],
        },
        {
          heading: "2. Eligibility and your account",
          body: [
            "You must be at least 18 years old and legally able to enter into a binding agreement. You are responsible for the accuracy of the information you provide and for keeping your login details and authenticator device secure.",
            "You may hold one account. Tell us promptly if you believe your account has been accessed without your permission.",
          ],
        },
        {
          heading: "3. What Meridian provides",
          body: [
            "Meridian sells goods and services such as airtime, data, electricity payments and cable TV payments. You pay for each order in cryptocurrency. We buy the item from a third-party provider and deliver it to you. Which items, providers and coins are available may change.",
          ],
        },
        {
          heading: "4. Prices and payment",
          body: [
            "Prices are shown in Nigerian naira and US dollars. When you start a payment, the crypto amount is quoted and the rate is held for a short window shown on the payment page. If the window passes, the order expires and you can start again.",
            "Crypto payments are final once confirmed on the network. Send only the asset on the network shown, to the address shown. Funds sent to the wrong network or address may be lost and we cannot recover them. If you underpay, the order is held for review.",
          ],
        },
        {
          heading: "5. Delivery",
          body: [
            "Delivery times depend on the item and the provider and are not promised. Details you enter, such as a phone number, meter number or smartcard number, must be correct. We cannot reverse a delivery made to details you entered incorrectly.",
          ],
        },
        {
          heading: "6. Refunds",
          body: [
            "If we cannot deliver an order you have paid for, we refund the amount you paid as store credit on your account. Where we offer it, we may refund in crypto instead. See the Refund policy and the page on crypto payment risks.",
          ],
        },
        {
          heading: "7. Identity verification and limits",
          body: [
            "We may require identity verification (KYC) before you can place larger orders, and we set order limits per account and per day. You must provide accurate, current information.",
          ],
        },
        {
          heading: "8. Acceptable use",
          body: [
            "You agree not to use Meridian for unlawful activity, money laundering, fraud, or to interfere with the service or other users. You must not attempt to access accounts, systems or data that are not yours.",
          ],
        },
        {
          heading: "9. Suspension and closure",
          body: [
            "We may suspend or close an account, hold an order or ask for further information where we reasonably suspect a breach of these terms, fraud, a security risk, or where the law requires it.",
          ],
        },
        {
          heading: "10. Limitation of liability",
          body: [
            "To the fullest extent permitted by law, Meridian is not liable for indirect or consequential losses, for losses caused by blockchain network events, third-party outages or events outside our reasonable control, or for losses arising from details you provide incorrectly. Nothing in these terms limits liability that cannot be limited by law.",
          ],
        },
        {
          heading: "11. Changes to the service and these terms",
          body: [
            "We may update the service and these terms. When changes are material we will notify you in the app or by email. Continuing to use Meridian after a change takes effect means you accept the updated terms.",
          ],
        },
        {
          heading: "12. Governing law and contact",
          body: [
            "These terms are governed by the laws of the jurisdiction in which Meridian is operated. The exact jurisdiction and registration details will be added after legal review. For questions, contact us through the support channel in your account.",
          ],
        },
      ] satisfies LegalSection[],
    },
    privacy: {
      title: "Privacy Policy",
      intro:
        "Draft for legal review. This policy explains what personal information Meridian collects, why we collect it and the choices you have.",
      sections: [
        {
          heading: "1. Information we collect",
          body: [
            "Account information: your name (if provided), email address and a hashed password.",
            "Verification information: the details you submit for identity (KYC) verification, such as your full name, date of birth, country, address, and ID type and number. ID numbers are stored encrypted, and ID photos are kept in private storage.",
            "Order and payment information: your orders, the details you enter for them (such as a phone number, meter number or smartcard number), payment records and the ledger of your store credit.",
            "Technical information: your IP address, browser and device details for security, and the sessions you are signed in on.",
          ],
        },
        {
          heading: "2. How we use your information",
          body: [
            "We use your information to create and secure your account, process and deliver orders, verify your identity, send service emails and notifications, prevent fraud and abuse, and meet legal obligations.",
          ],
        },
        {
          heading: "3. Email",
          body: [
            "We send service emails such as email confirmation, password resets, order updates and security notices through a third-party email delivery provider. We do not send marketing email unless you ask for it.",
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
            "We do not sell your personal information. We share it only with service providers that help us run Meridian (for example hosting, database, email delivery, our crypto payment processor and the providers that fulfil your orders), with authorities where the law requires it, and where needed to protect our users and platform. Providers may only use your information to provide their service to us.",
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
    refunds: {
      title: "Refund policy",
      intro:
        "Draft for legal review. This page explains when and how Meridian refunds an order. The details may change before ordering opens.",
      sections: [
        {
          heading: "1. When we refund",
          body: [
            "If you have paid for an order and we cannot deliver it, we refund the amount you paid. This includes the case where our provider rejects the order or does not complete it after we have retried.",
          ],
        },
        {
          heading: "2. How we refund",
          body: [
            "By default the refund is added to your account as store credit. Store credit can be used on later orders. It is not a bank deposit and cannot be withdrawn by default.",
            "Where we offer it, we may refund in crypto instead. A crypto refund is paid to an address you give us, on a network we support, and is decided by our team case by case. Network fees may be deducted.",
          ],
        },
        {
          heading: "3. When we do not refund",
          body: [
            "We cannot refund an order that was delivered to the details you entered, for example a phone number, meter number or smartcard number that was wrong. We cannot reverse a crypto payment that you sent to the wrong address or network.",
          ],
        },
        {
          heading: "4. Underpaid and late payments",
          body: [
            "If the amount we receive is less than the amount requested, the order is held for review. We will contact you and either ask for the difference, deliver a smaller amount where that is possible, or refund. If a payment arrives after the order window closed, we will handle it as a review case.",
          ],
        },
        {
          heading: "5. How long it takes",
          body: [
            "Refunds to store credit are applied automatically when an order fails. Crypto refunds need a review and take longer. We do not promise a specific time.",
          ],
        },
        {
          heading: "6. Contact",
          body: [
            "Open a support ticket from your account and link it to the order. The exact wording of this policy will be confirmed after legal review.",
          ],
        },
      ] satisfies LegalSection[],
    },
    risk: {
      title: "Crypto payment risks",
      intro: "Draft for legal review. " + disclaimers.footerRisk,
      sections: [
        {
          heading: "1. Payments are final",
          body: [
            "Transactions on a blockchain are generally irreversible. Once your payment is confirmed on the network, we cannot cancel it. If an order cannot be delivered, we refund as described in our Terms.",
          ],
        },
        {
          heading: "2. Network and address risks",
          body: [
            "Sending an asset on the wrong network, to the wrong address or without a required memo can result in permanent loss. Always check the asset, network and address on the payment page before you send.",
          ],
        },
        {
          heading: "3. Price movement",
          body: [
            "Crypto prices can change quickly. We lock the rate for a short window when you start a payment. If you pay after the window, the order may expire or be held for review.",
          ],
        },
        {
          heading: "4. Underpayment and overpayment",
          body: [
            "If the amount received is less than the amount requested, the order is held for review and may not be delivered until it is resolved. Network fees are your responsibility and are not part of the amount we receive.",
          ],
        },
        {
          heading: "5. Timing and availability",
          body: [
            "Confirmation and delivery can take longer than usual during network congestion, provider outages or maintenance.",
          ],
        },
        {
          heading: "6. Store credit",
          body: [
            "Refunds are issued as store credit by default. Store credit is not a bank deposit and is not covered by any deposit protection scheme.",
          ],
        },
        {
          heading: "7. Regulatory and tax",
          body: [
            "Rules about crypto assets differ by country and can change. You are responsible for knowing whether you may use Meridian where you live and for any taxes that apply.",
          ],
        },
        {
          heading: "8. Not advice",
          body: ["Nothing on this site is financial, legal or tax advice."],
        },
      ] satisfies LegalSection[],
    },
  },
};
