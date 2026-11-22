"use client";

import { Tag, Type } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createTicketAction } from "@/app/actions/support";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_CATEGORIES } from "@/lib/services/ticket-categories";

import { ActionForm, Field, SubmitButton, TextField } from "./form";
import { IconSelect } from "./icon-input";

export function NewTicketDialog({
  trigger,
  order,
}: {
  trigger: React.ReactNode;
  /** When set, the ticket is about this order and the dialog opens ready to fill in. */
  order?: { id: string; number: string };
}) {
  const [open, setOpen] = useState(Boolean(order));
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New support request</DialogTitle>
          <DialogDescription>
            Tell us what you need. Include amounts, assets and transaction IDs
            where they help.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={createTicketAction}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        >
          {order && <input type="hidden" name="orderId" value={order.id} />}
          <Field label="Topic" htmlFor="category">
            <IconSelect
              id="category"
              name="category"
              icon={Tag}
              defaultValue={order ? "order" : "account"}
            >
              {TICKET_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </IconSelect>
          </Field>
          <TextField
            name="subject"
            icon={Type}
            label="Subject"
            defaultValue={order ? `Order ${order.number}` : undefined}
            placeholder="e.g. My airtime has not arrived"
            required
            maxLength={120}
            autoComplete="off"
          />
          <Field label="Message" htmlFor="body">
            <Textarea
              id="body"
              name="body"
              rows={6}
              required
              minLength={10}
              maxLength={4000}
              placeholder="Describe what happened."
            />
          </Field>
          <SubmitButton pending="Sending…">Send request</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
