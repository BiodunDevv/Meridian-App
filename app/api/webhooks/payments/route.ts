import { NextResponse } from "next/server";

import { connectDb } from "@/lib/db";
import { Deposit, Withdrawal } from "@/lib/models";
import { verifyIpn } from "@/lib/payments/nowpayments";
import {
  applyPaymentStatus,
  applyPayoutStatus,
} from "@/lib/services/payment-events";

/**
 * Callback from the payment provider (deposits and payouts). Every request must carry a valid
 * HMAC-SHA512 signature in `x-nowpayments-sig`. Without the IPN secret configured this fails closed.
 * Unknown payments are acknowledged and ignored so the provider stops retrying them.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!verifyIpn(body, req.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  try {
    await connectDb();
    if (body.payment_id !== undefined) {
      const d = await Deposit.findOne({
        $or: [
          { providerPaymentId: String(body.payment_id) },
          ...(body.order_id ? [{ reference: String(body.order_id) }] : []),
        ],
      })
        .select("_id")
        .lean();
      if (d)
        await applyPaymentStatus(
          String(d._id),
          String(body.payment_status ?? ""),
          {
            actually_paid: Number(body.actually_paid) || undefined,
            pay_amount: Number(body.pay_amount) || undefined,
          },
        );
    } else if (body.id !== undefined && body.status !== undefined) {
      const w = await Withdrawal.findOne({
        providerPayoutId: String(body.id),
      })
        .select("_id")
        .lean();
      if (w)
        await applyPayoutStatus(
          String(w._id),
          String(body.status),
          (body.hash as string | undefined) ?? null,
          (body.error as string | undefined) ?? null,
        );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook] payments failed", e);
    // A 500 makes the provider retry later.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
