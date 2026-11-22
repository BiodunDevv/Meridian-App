"use server";

import { revalidatePath } from "next/cache";

import { allowIp } from "@/lib/auth/client-ip";
import { requireUser } from "@/lib/auth/guards";
import { withIdempotency } from "@/lib/auth/idempotency";
import { rateLimit } from "@/lib/auth/rate-limit";
import { log } from "@/lib/log";
import { createAdapter } from "@/lib/providers";
import { revealDelivery } from "@/lib/services/fulfilment";
import { startOrderPayment } from "@/lib/services/order-payments";
import {
  cancelOrder,
  checkLimits,
  createOrderRecord,
  OrderError,
  quoteOrder,
  transition,
  validateInputs,
} from "@/lib/services/orders";
import { getShopSettings } from "@/lib/services/shop-settings";
import type { ActionState } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function fail(e: unknown): ActionState {
  if (e instanceof OrderError) return { ok: false, error: e.message };
  log.error("[orders] action failed", e instanceof Error ? e.message : e);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export interface QuoteView {
  ok: boolean;
  error?: string;
  priceMinor?: number;
  otherMinor?: number | null;
  currency?: "NGN" | "USD";
  optionLabel?: string;
  open?: boolean;
}

/** The price for the checkout summary. Computed on the server; the browser sends only a choice. */
export async function quoteOrderAction(sel: {
  productId: string;
  option?: string;
  amount?: string;
}): Promise<QuoteView> {
  // Anyone can ask for a price, so it is limited by address.
  if (!(await allowIp("quote", 120, 300)))
    return { ok: false, error: "Too many requests. Please wait a moment." };
  try {
    const s = await getShopSettings();
    const q = await quoteOrder({
      productId: String(sel.productId ?? ""),
      option: sel.option ? String(sel.option) : undefined,
      amount: sel.amount ? String(sel.amount) : undefined,
    });
    // Never send cost or margin to the browser.
    return {
      ok: true,
      priceMinor: q.priceMinor,
      otherMinor: q.otherMinor,
      currency: q.currency,
      optionLabel: q.optionLabel,
      open: s.ordersOpen && !s.maintenance,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof OrderError ? e.message : "Could not price this item.",
    };
  }
}

/**
 * Creates an order and its payment. The price is recomputed here from the catalogue, the inputs are validated here,
 * and the limits are checked here. The browser's numbers are never used.
 */
export async function createOrderAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      const settings = await getShopSettings();
      if (!settings.ordersOpen)
        throw new OrderError(
          "Ordering is not open yet. Please check back soon.",
        );
      if (!(await rateLimit(`order:${user.id}`, 10, 3600)))
        throw new OrderError(
          "You are placing orders too quickly. Please wait a little and try again.",
        );
      const q = await quoteOrder({
        productId: str(f, "productId"),
        option: str(f, "option") || undefined,
        amount: str(f, "amount") || undefined,
      });
      const raw: Record<string, string> = {};
      for (const def of q.inputs) raw[def.key] = str(f, `in_${def.key}`);
      const inputs = validateInputs(q.inputs, raw);
      const adapter = createAdapter(q.providerKey, q.provider.mode);
      const check = await adapter?.validateInput(
        {
          providerCode: q.providerCode,
          kind: q.kind,
          categorySlug: q.categorySlug,
        },
        inputs,
      );
      if (check && !check.ok)
        throw new OrderError(check.error ?? "Check the details and try again.");
      await checkLimits(user.id, q.amountUsdCents);
      const order = await createOrderRecord(
        user.id,
        q,
        inputs,
        str(f, "idemKey") || undefined,
      );
      try {
        await startOrderPayment(order, {
          asset: str(f, "asset"),
          network: str(f, "network"),
        });
      } catch (e) {
        // No payment was created, so nothing can arrive for this order. Close it cleanly.
        await transition(order._id, "created", "cancelled", {
          message: "The payment could not be started.",
        });
        throw e;
      }
      return {
        ok: true,
        id: String(order._id),
        message: "Order created. Complete your payment.",
      } as ActionState;
    } catch (e) {
      return fail(e);
    }
  });
  revalidatePath("/dashboard/orders");
  return r;
}

export async function cancelOrderAction(f: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await rateLimit(`cancelord:${user.id}`, 30, 3600)))
    return {
      ok: false,
      error: "Too many attempts. Please wait a little and try again.",
    } as ActionState;
  try {
    await cancelOrder(user.id, str(f, "id"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${str(f, "id")}`);
  return { ok: true, message: "Order cancelled." };
}

export interface RevealResult {
  ok: boolean;
  error?: string;
  delivery?: {
    kind: "token" | "none";
    token?: string;
    units?: string;
  };
}

/**
 * Shows a code or token to the order's owner. Every call is audited. For view-once products the first call uses it up.
 * The details are never put in an email, a notification or a page's static HTML.
 */
export async function revealDeliveryAction(
  orderId: string,
): Promise<RevealResult> {
  const user = await requireUser();
  if (!(await rateLimit(`reveal:${user.id}`, 30, 3600)))
    return { ok: false, error: "Too many requests. Please wait a little." };
  try {
    const d = await revealDelivery(user.id, String(orderId ?? ""));
    if (!d)
      return { ok: false, error: "There is nothing to show for this order." };
    return { ok: true, delivery: d };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not show the details.",
    };
  }
}
