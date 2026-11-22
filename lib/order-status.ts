/** How an order status reads to the customer. Safe to import anywhere. */
export const ORDER_LABEL: Record<string, string> = {
  created: "Starting",
  awaiting_payment: "Awaiting payment",
  paid: "Payment received",
  fulfilling: "Placing your order",
  delivered: "Delivered",
  failed: "Could not deliver",
  refunded: "Refunded",
  review: "Being checked",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const orderLabel = (s: string) => ORDER_LABEL[s] ?? s;
