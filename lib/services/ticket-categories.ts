export const TICKET_CATEGORIES = [
  { value: "deposit", label: "Deposits" },
  { value: "withdrawal", label: "Withdrawals" },
  { value: "order", label: "Orders" },
  { value: "account", label: "Account and security" },
  { value: "other", label: "Something else" },
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]["value"];
