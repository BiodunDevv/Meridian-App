import { Types } from "mongoose";

import { connectDb } from "../db";
import { emails } from "../email/templates";
import { Order, Ticket, TicketMessage, User } from "../models";
import { alertAdmins, notify } from "./notify";
import { TICKET_CATEGORIES, type TicketCategory } from "./ticket-categories";

export { TICKET_CATEGORIES };
export type { TicketCategory };

export const ticketRef = (id: unknown) =>
  `#${String(id).slice(-6).toUpperCase()}`;

/** Quick replies for admins. */
export const CANNED_REPLIES = [
  {
    label: "Deposit under review",
    text: "Thanks for your patience. Your deposit is with our team and we aim to confirm within about an hour. We will update you here as soon as it is credited.",
  },
  {
    label: "Need the transaction ID",
    text: "To confirm your deposit faster, please reply with the transaction ID (hash) and the network you used.",
  },
  {
    label: "Wrong network warning",
    text: "It looks like the funds were sent on a different network from the one shown. Please tell us which network you used and the transaction ID so we can check what is possible. Please note funds sent to the wrong network may not be recoverable.",
  },
  {
    label: "Withdrawal in review",
    text: "Your withdrawal request is in our review queue. The amount is on hold and we will pay it out and share the transaction hash here and by email.",
  },
  {
    label: "Verify identity first",
    text: "Identity verification is required before your first withdrawal. You can submit your details from Settings, and our team will review them promptly.",
  },
  {
    label: "Order: still processing",
    text: "Thanks for your patience. Your order is being processed by our provider. Delivery time depends on the item and the provider, and we do not promise a time. You can watch its status on the order page, and we will email you as soon as it is delivered.",
  },
  {
    label: "Order: wrong number entered",
    text: "Our provider delivered this order to the details entered when it was placed. Unfortunately a delivery to a wrong phone, meter or smartcard number cannot be reversed. If you tell us what you entered and what it should have been, we will check what is possible, but we cannot promise a refund.",
  },
  {
    label: "Order: could not deliver",
    text: "We were not able to deliver this order. Your payment has been refunded to your store credit, and you can use it on a later order. If you would rather have a crypto refund, reply with the coin, the network and your wallet address and we will review it.",
  },
  {
    label: "Order: refund status",
    text: "Your refund is being handled. Refunds to store credit are applied straight away. Crypto refunds need a review by our team and take longer, and we do not promise a time. We will update you here.",
  },
  {
    label: "Order: payment amount short",
    text: "The amount we received for this order was lower than the amount requested, so the order is on hold. You do not need to pay again. We will contact you here about the difference, or refund the amount received.",
  },
  {
    label: "Resolved, anything else?",
    text: "We have resolved this. If anything is still unclear, reply here and we will pick it up.",
  },
];

export async function createTicket(
  user: { id: string; email: string },
  input: {
    subject: string;
    category: TicketCategory;
    body: string;
    orderId?: string;
  },
) {
  await connectDb();
  // A ticket can only point at the customer's own order.
  const orderId =
    input.orderId &&
    (await Order.exists({ _id: input.orderId, userId: user.id }))
      ? input.orderId
      : undefined;
  const t = await Ticket.create({
    userId: user.id,
    ...(orderId ? { orderId } : {}),
    subject: input.subject,
    category: input.category,
    status: "open",
    lastMessageBy: "user",
    unreadByAdmin: true,
    unreadByUser: false,
    messageCount: 1,
  });
  await TicketMessage.create({
    ticketId: t._id,
    authorId: user.id,
    authorRole: "user",
    body: input.body,
  });
  await alertAdmins(
    "New support ticket",
    [
      ["From", user.email],
      ["Subject", input.subject],
      ["Topic", input.category],
      ["Message", input.body.slice(0, 200)],
    ],
    `/admin/support/${t._id}`,
  );
  return t;
}

/** A user or admin message on a ticket. Internal notes never notify or reach the user. */
export async function addMessage(
  ticketId: string,
  author: { id: string; email: string; role: "user" | "admin" },
  body: string,
  opts: { internal?: boolean } = {},
) {
  await connectDb();
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new Error("Ticket not found.");
  if (author.role === "user" && String(ticket.userId) !== author.id)
    throw new Error("Ticket not found.");
  if (author.role === "user" && ticket.status === "closed") {
    // Replying to a closed ticket reopens it.
  }
  const internal = Boolean(opts.internal) && author.role === "admin";
  await TicketMessage.create({
    ticketId,
    authorId: author.id,
    authorRole: author.role,
    body,
    internal,
  });
  if (internal) return;

  ticket.messageCount += 1;
  ticket.lastMessageAt = new Date();
  ticket.lastMessageBy = author.role;
  if (author.role === "admin") {
    ticket.status = "pending";
    ticket.unreadByUser = true;
    ticket.unreadByAdmin = false;
  } else {
    ticket.status = "open";
    ticket.unreadByAdmin = true;
  }
  await ticket.save();

  if (author.role === "admin") {
    await notify(
      String(ticket.userId),
      {
        title: `Reply on ${ticketRef(ticket._id)}`,
        body: body.slice(0, 140),
        href: `/dashboard/support/${ticket._id}`,
      },
      emails.ticketReply(
        ticket.subject,
        ticketRef(ticket._id),
        body,
        `/dashboard/support/${ticket._id}`,
      ),
    );
  } else {
    await alertAdmins(
      "New reply on a support ticket",
      [
        ["From", author.email],
        ["Subject", ticket.subject],
        ["Message", body.slice(0, 200)],
      ],
      `/admin/support/${ticket._id}`,
    );
  }
}

export async function setTicketStatus(
  ticketId: string,
  status: "open" | "pending" | "closed",
  by: "user" | "admin",
) {
  await connectDb();
  const t = await Ticket.findById(ticketId);
  if (!t) throw new Error("Ticket not found.");
  t.status = status;
  if (by === "admin" && status === "closed") {
    t.unreadByUser = true;
    await notify(
      String(t.userId),
      {
        title: `${ticketRef(t._id)} was closed`,
        body: t.subject,
        href: `/dashboard/support/${t._id}`,
      },
      emails.ticketClosed(
        t.subject,
        ticketRef(t._id),
        `/dashboard/support/${t._id}`,
      ),
    );
  }
  await t.save();
}

/** Marks a ticket as read for whoever is viewing it. */
export async function markRead(ticketId: string, side: "user" | "admin") {
  await connectDb();
  await Ticket.updateOne(
    { _id: ticketId },
    side === "user" ? { unreadByUser: false } : { unreadByAdmin: false },
  );
}

export async function getThread(
  ticketId: string,
  opts: { includeInternal: boolean },
) {
  await connectDb();
  if (!Types.ObjectId.isValid(ticketId)) return null;
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) return null;
  const messages = await TicketMessage.find({
    ticketId,
    ...(opts.includeInternal ? {} : { internal: { $ne: true } }),
  })
    .sort({ createdAt: 1 })
    .lean();
  const owner = await User.findById(ticket.userId)
    .select("email username name")
    .lean();
  return {
    ticket: JSON.parse(JSON.stringify(ticket)),
    messages: JSON.parse(JSON.stringify(messages)) as {
      _id: string;
      authorRole: "user" | "admin";
      body: string;
      internal?: boolean;
      createdAt: string;
    }[],
    owner: owner ? JSON.parse(JSON.stringify(owner)) : null,
  };
}
