/**
 * Built-in templates for admin messages. Variables are replaced per recipient:
 *   {{firstName}}  first name, or username, or "there"
 *   {{username}}   their username
 *   {{email}}      their email
 * Blank line = new paragraph. **bold** and lines starting with "- " are supported.
 */
export interface MessageTemplateDef {
  key: string;
  category: "Onboarding" | "Account" | "Product" | "Operations" | "Support";
  name: string;
  subject: string;
  body: string;
  /** Suggested audience, shown as a hint. */
  audience?: string;
}

export const VARIABLES = ["firstName", "username", "email"] as const;

export const BUILT_IN_TEMPLATES: MessageTemplateDef[] = [
  {
    key: "welcome-nudge",
    category: "Onboarding",
    name: "Make your first deposit",
    subject: "Ready to make your first deposit?",
    body: "Hi {{firstName}},\n\nYour Meridian account is ready. Funding it takes about a minute:\n\n- Open **Deposit** and pick an asset and network\n- Send to the address shown, then tap **I have paid**\n- We confirm and credit your balance, targeted within the hour\n\nOnly send the asset on the network shown. Funds sent to the wrong network may be lost.",
    audience: "Never deposited",
  },
  {
    key: "choose-plan",
    category: "Onboarding",
    name: "Choose an investment plan",
    subject: "Your balance is ready. Pick a plan.",
    body: "Hi {{firstName}},\n\nYour deposit is confirmed and your balance is available. You can now compare plans by minimum, term and projected return before you invest.\n\nProjected returns are illustrative and not guaranteed. Your capital is at risk.",
    audience: "Have deposited",
  },
  {
    key: "kyc-reminder",
    category: "Account",
    name: "Verify your identity",
    subject: "Verify your identity to unlock withdrawals",
    body: "Hi {{firstName}},\n\nIdentity (KYC) verification is required before your first withdrawal. It takes a few minutes and you only do it once. Our team reviews every submission.\n\nYou can start from **Settings**.",
    audience: "Not yet verified",
  },
  {
    key: "enable-2fa",
    category: "Account",
    name: "Turn on two-step login",
    subject: "Add extra protection to your account",
    body: "Hi {{firstName}},\n\nTwo-step login adds a code from your authenticator app each time you log in, plus one-time recovery codes for emergencies.\n\nYou can turn it on from **Settings**. It takes about a minute.",
    audience: "Two-step login off",
  },
  {
    key: "new-plan",
    category: "Product",
    name: "New plan announcement",
    subject: "A new investment plan is available",
    body: "Hi {{firstName}},\n\nWe have added a new plan. Every plan shows its minimum, maximum, term and projected return up front, so you can compare before you commit.\n\nProjected returns are illustrative and not guaranteed. Your capital is at risk.",
    audience: "All users",
  },
  {
    key: "deposit-address-update",
    category: "Operations",
    name: "Deposit address updated",
    subject: "Important: our deposit addresses have changed",
    body: "Hi {{firstName}},\n\nWe have updated some deposit addresses. **Always copy the address shown in the Deposit page at the time you send.** Do not reuse an address from an earlier deposit.\n\nIf you have a deposit in progress, contact support before sending.",
    audience: "All users",
  },
  {
    key: "maintenance",
    category: "Operations",
    name: "Scheduled maintenance",
    subject: "Scheduled maintenance notice",
    body: "Hi {{firstName}},\n\nWe will carry out scheduled maintenance. During this window the dashboard may be unavailable and deposit and withdrawal reviews may be delayed.\n\nYour balance and investments are not affected. Thank you for your patience.",
    audience: "All users",
  },
  {
    key: "review-delay",
    category: "Operations",
    name: "Review times are longer",
    subject: "Deposits and withdrawals are taking longer than usual",
    body: "Hi {{firstName}},\n\nWe are seeing high demand, so deposit and withdrawal reviews may take longer than our usual target. Every request is being handled in order and nothing needs to be resubmitted.\n\nThank you for your patience.",
    audience: "All users",
  },
  {
    key: "policy-update",
    category: "Support",
    name: "Terms or policy update",
    subject: "We have updated our terms",
    body: "Hi {{firstName}},\n\nWe have updated our Terms of Service and Privacy Policy. Please take a moment to read the changes. By continuing to use Meridian you accept the updated terms.",
    audience: "All users",
  },
  {
    key: "support-followup",
    category: "Support",
    name: "Personal follow-up",
    subject: "Following up on your request",
    body: "Hi {{firstName}},\n\nThanks for getting in touch. Here is an update on your request:\n\n[Write your update here]\n\nIf you need anything else, contact support from your account.",
    audience: "Selected users",
  },
];
