"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff, requireUser } from "@/lib/auth/guards";
import { withIdempotency } from "@/lib/auth/idempotency";
import { rateLimit } from "@/lib/auth/rate-limit";
import { connectDb } from "@/lib/db";
import { Ticket } from "@/lib/models";
import { audit } from "@/lib/services/notify";
import {
  addMessage,
  createTicket,
  setTicketStatus,
  TICKET_CATEGORIES,
} from "@/lib/services/support";
import { type ActionState, firstError } from "@/lib/validation";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const body = z
  .string()
  .trim()
  .min(2, "Write a message.")
  .max(4000, "Keep it under 4,000 characters.");

export async function createTicketAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState & { id?: string }> {
  const user = await requireUser();
  const parsed = z
    .object({
      subject: z
        .string()
        .trim()
        .min(3, "Add a short subject.")
        .max(120, "Keep the subject under 120 characters."),
      category: z.enum(
        TICKET_CATEGORIES.map((c) => c.value) as [string, ...string[]],
      ),
      body: body.min(10, "Tell us a little more (10+ characters)."),
      orderId: z.string().max(40).optional(),
    })
    .safeParse({
      subject: str(f, "subject"),
      category: str(f, "category"),
      body: str(f, "body"),
      orderId: str(f, "orderId") || undefined,
    });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!(await rateLimit(`ticket:${user.id}`, 5, 3600)))
    return {
      ok: false,
      error:
        "You have opened several requests recently. Please wait before opening another.",
    };
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    const t = await createTicket(
      user,
      parsed.data as {
        subject: string;
        category: "other";
        body: string;
        orderId?: string;
      },
    );
    return {
      ok: true,
      message: "Request sent. We will reply here and by email.",
      id: String(t._id),
    };
  });
  revalidatePath("/dashboard/support");
  return r;
}

export async function replyTicketAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = body.safeParse(str(f, "body"));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!(await rateLimit(`ticket-reply:${user.id}`, 30, 3600)))
    return { ok: false, error: "Too many messages. Please wait a little." };
  const id = str(f, "ticketId");
  const r = await withIdempotency(user.id, str(f, "idemKey"), async () => {
    try {
      await addMessage(
        id,
        { id: user.id, email: user.email, role: "user" },
        parsed.data,
      );
      return { ok: true, message: "Message sent." };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Could not send.",
      };
    }
  });
  revalidatePath(`/dashboard/support/${id}`);
  return r;
}

export async function closeOwnTicketAction(f: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!(await rateLimit(`tclose:${user.id}`, 30, 3600)))
    return {
      ok: false,
      error: "Too many attempts. Please wait a little and try again.",
    } as ActionState;
  const id = str(f, "ticketId");
  await connectDb();
  const t = await Ticket.findOne({ _id: id, userId: user.id })
    .select("_id")
    .lean();
  if (!t) return { ok: false, error: "Ticket not found." };
  await setTicketStatus(id, "closed", "user");
  revalidatePath(`/dashboard/support/${id}`);
  return { ok: true, message: "Request closed." };
}

/* ---------- Admin ---------- */
export async function adminReplyAction(
  _: ActionState,
  f: FormData,
): Promise<ActionState> {
  const admin = await requireStaff("support.reply");
  const parsed = body.safeParse(str(f, "body"));
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const id = str(f, "ticketId");
  const internal = str(f, "mode") === "note";
  try {
    await addMessage(
      id,
      { id: admin.id, email: admin.email, role: "admin" },
      parsed.data,
      { internal },
    );
    await audit(admin, internal ? "support.note" : "support.reply", id);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not send.",
    };
  }
  revalidatePath(`/admin/support/${id}`);
  revalidatePath("/admin/support");
  return {
    ok: true,
    message: internal ? "Internal note saved." : "Reply sent to the user.",
  };
}

export async function adminSetStatusAction(f: FormData): Promise<ActionState> {
  const admin = await requireStaff("support.reply");
  const id = str(f, "ticketId");
  const status = z
    .enum(["open", "pending", "closed"])
    .safeParse(str(f, "status"));
  if (!status.success) return { ok: false, error: "Invalid status." };
  await setTicketStatus(id, status.data, "admin");
  await audit(admin, `support.${status.data}`, id);
  revalidatePath(`/admin/support/${id}`);
  revalidatePath("/admin/support");
  return { ok: true, message: `Ticket marked ${status.data}.` };
}
