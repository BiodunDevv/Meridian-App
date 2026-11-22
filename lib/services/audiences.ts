export const AUDIENCES = [
  {
    key: "all",
    label: "All active users",
    hint: "Every verified, active customer",
  },
  { key: "kyc_approved", label: "Identity verified", hint: "KYC approved" },
  {
    key: "kyc_pending",
    label: "Identity under review",
    hint: "KYC submitted, waiting",
  },
  { key: "kyc_none", label: "Not yet verified", hint: "No KYC submitted" },
  {
    key: "funded",
    label: "Have deposited",
    hint: "At least one confirmed deposit",
  },
  {
    key: "unfunded",
    label: "Never deposited",
    hint: "No confirmed deposit yet",
  },
  {
    key: "no_mfa",
    label: "Two-step login off",
    hint: "Good for security reminders",
  },
  {
    key: "selected",
    label: "Choose specific users",
    hint: "Search and pick recipients",
  },
] as const;

export type AudienceKey = (typeof AUDIENCES)[number]["key"];
export const audienceLabel = (k: string) =>
  AUDIENCES.find((a) => a.key === k)?.label ?? k;
