"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAdmin } from "@/lib/auth/guards";
import { fulfilOrder } from "@/lib/services/fulfilment";
import { audit } from "@/lib/services/notify";
import { syncOrderPayment } from "@/lib/services/order-payments";
import type { ActionState } from "@/lib/validation";

/** Re-asks the payment provider about one order and applies the answer. Admin only. */
export async function syncOrderNowAction(f: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(f.get("id") ?? "");
  try {
    const r = await syncOrderPayment(id, true);
    if (r === "paid") after(() => fulfilOrder(id));
    await audit(admin, "order.payment_sync", id, { result: r ?? "no change" });
    revalidatePath("/admin/reconciliation");
    revalidatePath(`/admin/orders/${id}`);
    return {
      ok: true,
      message:
        r === "paid"
          ? "Payment found. The order is being placed."
          : "Checked with the payment provider.",
    };
  } catch {
    return { ok: false, error: "Could not reach the payment provider." };
  }
}
