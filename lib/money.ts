export const toCents = (usd: number) => Math.round(usd * 100);

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
export const formatUsd = (cents: number) => fmt.format(cents / 100);

export const formatDate = (d: Date | string | number) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(d));

export const formatDateTime = (d: Date | string | number) =>
  new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));

/** Formats a minor-unit amount (kobo or cents) in its own currency. Safe to import in client components. */
export const formatMinor = (minor: number, currency: "NGN" | "USD") =>
  new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
