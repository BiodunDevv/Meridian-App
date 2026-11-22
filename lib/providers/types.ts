/**
 * The contract every fulfilment provider implements. All money is integer minor units.
 *
 * Safety rules the callers and the adapters share:
 *  - A purchase is sent AT MOST ONCE per `requestId`. An adapter never retries a purchase itself.
 *  - When the outcome is unknown (timeout, no response, unexpected reply) the adapter returns
 *    `status: "unknown"`. The caller must then call `status()` and only buy again when the
 *    provider answers `not_found`.
 *  - Nothing secret is ever put into `message` or `raw`.
 */
export type Mode = "sandbox" | "live";
export type Currency = "NGN" | "USD";

export interface PurchaseRequest {
  /**
   * The provider-side idempotency key, made once and stored on the order before the first call.
   * For VTpass it must start with today's date (see `vtpassRequestId`), so it cannot be regenerated on a later day.
   */
  requestId: string;
  /** Our order number, for reference and for providers that accept a custom identifier. */
  orderNumber: string;
  /** Provider product code, as stored on the Product. */
  providerCode: string;
  kind: "fixed" | "open";
  currency: Currency;
  /** Face value to deliver, in minor units. */
  valueMinor: number;
  /** Customer inputs, already validated against the product's input definitions. */
  inputs: Record<string, string>;
}

export type Delivery =
  { kind: "none" } | { kind: "token"; token: string; units?: string };

export interface PurchaseOutcome {
  /**
   * success: delivered. pending: accepted, not final yet. failed: definitely not delivered and not charged.
   * not_found: the provider has no record of this requestId (only from `status()`).
   * unknown: we cannot tell (timeout, no or odd response). Never buy again until `status()` says not_found.
   */
  status: "success" | "pending" | "failed" | "not_found" | "unknown";
  /** The provider's own transaction reference, when it gave one. */
  providerRef?: string;
  /** A short, plain, secret-free description for the admin timeline. */
  message: string;
  /** The raw provider status or code, for debugging. */
  providerCode?: string;
  delivery?: Delivery;
  /** Redacted copy of the response, safe to store for debugging. */
  raw?: unknown;
}

export interface BalanceResult {
  balanceMinor: number;
  currency: Currency;
}

export interface CatalogueItem {
  providerCode: string;
  name: string;
  /** Matches a ServiceCategory slug (airtime, data, electricity, tv). */
  categorySlug: string;
  kind: "fixed" | "open";
  currency: Currency;
  denominations: { label: string; valueMinor: number; costMinor: number }[];
  minMinor: number;
  maxMinor: number;
  /** Open products: our cost as basis points of the face value. 10000 means no discount. */
  costBps: number;
  logo?: string;
  notes?: string;
}

export interface ProductRef {
  providerCode: string;
  kind: "fixed" | "open";
  categorySlug?: string;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  /** A name the provider confirmed, such as the meter owner. Shown to the customer to catch typos. */
  confirmedName?: string;
}

export interface WebhookEvent {
  requestId: string;
  outcome: PurchaseOutcome;
  /**
   * True when the callback has no signature of its own (only a secret in the URL). The caller must
   * confirm the result with `status()` before changing an order, and never trust the body alone.
   */
  confirmWithStatus: boolean;
}

export interface ProviderAdapter {
  readonly key: string;
  readonly mode: Mode;
  /** True when the credentials for this mode are present. */
  isConfigured(): boolean;
  balance(): Promise<BalanceResult>;
  /** Cheap check that credentials work. Never spends money. */
  ping(): Promise<{ ok: boolean; message: string }>;
  catalogue(opts?: { country?: string }): Promise<CatalogueItem[]>;
  /** Checks inputs for a product. May ask the provider (for example to verify a meter). */
  validateInput(
    product: ProductRef,
    inputs: Record<string, string>,
  ): Promise<ValidationResult>;
  purchase(req: PurchaseRequest): Promise<PurchaseOutcome>;
  status(requestId: string): Promise<PurchaseOutcome>;
  /** Verifies and parses a callback. Returns null when it is not authentic. Fails closed. */
  parseWebhook(
    headers: Headers,
    rawBody: string,
    query?: URLSearchParams,
  ): WebhookEvent | null;
}

export class ProviderNotConfigured extends Error {
  constructor(key: string, mode: Mode) {
    super(
      `${key} is not configured for ${mode} mode. Add its keys to the server environment.`,
    );
  }
}
