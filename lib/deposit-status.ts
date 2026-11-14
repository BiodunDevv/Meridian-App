/** How a deposit status reads to the user, like a payment platform. */
export const DEPOSIT_LABEL: Record<string, string> = {
  awaiting: "Awaiting payment",
  pending: "Under review",
  approved: "Credited",
  rejected: "Not confirmed",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** The label for a deposit. An online payment that was seen on the network reads "Confirming". */
export const depositLabel = (status: string, provider?: string | null) =>
  provider && status === "pending"
    ? "Confirming"
    : (DEPOSIT_LABEL[status] ?? status);
