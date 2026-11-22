"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/auth/guards";
import { PermissionError } from "@/lib/auth/permissions";
import { log } from "@/lib/log";
import * as svc from "@/lib/services/order-admin";
import { OrderError } from "@/lib/services/orders";
import type { ActionState } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Runs one order action as the signed-in admin or staff member. The service checks the permission again. */
async function act(
  perm: Parameters<typeof requireStaff>[0],
  f: FormData,
  fn: (a: svc.Actor, id: string) => Promise<string>,
): Promise<ActionState> {
  const user = await requireStaff(perm);
  const id = str(f, "id");
  try {
    const message = await fn(
      { id: user.id, email: user.email, role: user.role },
      id,
    );
    revalidatePath(`/admin/orders/${id}`);
    revalidatePath("/admin/orders");
    revalidatePath(`/dashboard/orders/${id}`);
    return { ok: true, message };
  } catch (e) {
    revalidatePath(`/admin/orders/${id}`);
    if (e instanceof OrderError || e instanceof PermissionError)
      return { ok: false, error: e.message };
    log.error("[order-admin]", e instanceof Error ? e.message : e);
    return {
      ok: false,
      error:
        "Something went wrong. Nothing was changed twice; reload and check the order.",
    };
  }
}

export async function retryOrderAction(f: FormData) {
  return act("orders.retry", f, (a, id) =>
    svc.retryFulfilment(a, id, str(f, "reason")),
  );
}
export async function markDeliveredAction(f: FormData) {
  return act("orders.mark_delivered", f, (a, id) =>
    svc.markDelivered(a, id, {
      proof: str(f, "proof"),
      token: str(f, "token"),
    }),
  );
}
export async function refundCreditAction(f: FormData) {
  return act("orders.refund_credit", f, (a, id) =>
    svc.refundCredit(a, id, str(f, "reason")),
  );
}
export async function refundCryptoAction(f: FormData) {
  return act("orders.refund_crypto", f, (a, id) =>
    svc.refundCrypto(a, id, {
      asset: str(f, "asset"),
      network: str(f, "network"),
      address: str(f, "address"),
      reason: str(f, "reason"),
    }),
  );
}
export async function cancelOrderAdminAction(f: FormData) {
  return act("orders.cancel", f, (a, id) =>
    svc.cancelUnpaid(a, id, str(f, "reason")),
  );
}
export async function addOrderNoteAction(f: FormData) {
  return act("orders.note", f, (a, id) => svc.addNote(a, id, str(f, "note")));
}
export async function resendOrderEmailAction(f: FormData) {
  return act("orders.resend", f, (a, id) => svc.resendEmail(a, id));
}

export interface AdminRevealResult {
  ok: boolean;
  error?: string;
  delivery?: {
    kind: string;
    token?: string;
    units?: string;
  };
}
export async function adminRevealAction(
  orderId: string,
): Promise<AdminRevealResult> {
  const user = await requireStaff("orders.reveal");
  try {
    const d = await svc.adminReveal(
      { id: user.id, email: user.email, role: user.role },
      String(orderId ?? ""),
    );
    return { ok: true, delivery: d };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not show the details.",
    };
  }
}
