"use client";

import { useState, useTransition } from "react";

import {
  addOrderNoteAction,
  adminRevealAction,
  type AdminRevealResult,
  cancelOrderAdminAction,
  markDeliveredAction,
  refundCreditAction,
  refundCryptoAction,
  resendOrderEmailAction,
  retryOrderAction,
} from "@/app/actions/order-admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/validation";

import { CopyField } from "./copy-field";
import { Field, SubmitButton, TextField } from "./form";
import { ToastForm } from "./toast-form";

type A = (f: FormData) => Promise<ActionState>;

/** A button that opens a dialog with a form. The server action, not this screen, decides whether it is allowed. */
function ActionDialog({
  title,
  description,
  trigger,
  action,
  id,
  children,
  submit,
  danger,
}: {
  title: string;
  description: string;
  trigger: string;
  action: A;
  id: string;
  children: React.ReactNode;
  submit: string;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={danger ? "outline" : "default"}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          action={async (fd) => {
            const { toast } = await import("sonner");
            const r = await action(fd);
            if (r.ok) {
              toast.success(r.message ?? "Done.");
              setOpen(false);
            } else toast.error(r.error ?? "Something went wrong.");
          }}
        >
          <input type="hidden" name="id" value={id} />
          {children}
          <SubmitButton
            pending="Working…"
            variant={danger ? "outline" : "default"}
          >
            {submit}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Reason = ({
  label = "Reason",
  hint,
}: {
  label?: string;
  hint?: string;
}) => (
  <Field label={label} htmlFor="reason" hint={hint}>
    <Textarea
      id="reason"
      name="reason"
      rows={3}
      required
      minLength={5}
      maxLength={500}
    />
  </Field>
);

/**
 * The action row for one order. Which buttons appear depends on the status and the role, but that only hides buttons:
 * every action is checked again on the server for the person's role.
 */
export function OrderAdminActions({
  id,
  status,
  role,
  hasDelivery,
  coins,
}: {
  id: string;
  status: string;
  role: string;
  hasDelivery: boolean;
  coins: { symbol: string; networks: string[] }[];
}) {
  const isAdmin = role === "admin";
  const paidStates = ["paid", "fulfilling", "review", "failed", "delivered"];
  const canRefund = ["paid", "review", "failed"].includes(status);
  const [asset, setAsset] = useState(coins[0]?.symbol ?? "");
  const nets = coins.find((c) => c.symbol === asset)?.networks ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {["review", "failed"].includes(status) && (
        <ActionDialog
          title="Retry fulfilment"
          description="We ask the provider about the earlier attempt first, and only send again if it never took it. A retry never double-buys."
          trigger="Retry"
          action={retryOrderAction}
          id={id}
          submit="Retry now"
        >
          <Reason hint="Why are you retrying? This is recorded." />
        </ActionDialog>
      )}
      {["fulfilling", "review"].includes(status) && (
        <ActionDialog
          title="Mark as delivered"
          description="Use this when you delivered it yourself. Proof is required and is recorded. A token you add is encrypted and shown to the customer."
          trigger="Mark delivered"
          action={markDeliveredAction}
          id={id}
          submit="Mark delivered"
          danger
        >
          <Field
            label="Proof"
            htmlFor="proof"
            hint="For example the provider's reference or where you confirmed it."
          >
            <Textarea
              id="proof"
              name="proof"
              rows={3}
              required
              minLength={10}
              maxLength={1000}
            />
          </Field>
          <TextField name="token" label="Token (optional)" autoComplete="off" />
        </ActionDialog>
      )}
      {canRefund && (
        <ActionDialog
          title="Refund to store credit"
          description="Adds the order price to the customer's store credit. It can only happen once."
          trigger="Refund to credit"
          action={refundCreditAction}
          id={id}
          submit="Refund to credit"
          danger
        >
          <Reason />
        </ActionDialog>
      )}
      {canRefund && isAdmin && (
        <ActionDialog
          title="Refund to crypto"
          description="Refunds to store credit once, then requests a withdrawal to the address below. The customer must be identity verified. If the withdrawal is refused, the money stays as store credit."
          trigger="Refund to crypto"
          action={refundCryptoAction}
          id={id}
          submit="Refund to crypto"
          danger
        >
          <Field label="Coin" htmlFor="asset">
            <select
              id="asset"
              name="asset"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              {coins.map((c) => (
                <option key={c.symbol} value={c.symbol}>
                  {c.symbol}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Network" htmlFor="network">
            <select
              id="network"
              name="network"
              className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm"
            >
              {nets.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <TextField
            name="address"
            label="Customer's wallet address"
            required
            autoComplete="off"
            spellCheck={false}
          />
          <Reason />
        </ActionDialog>
      )}
      {["created", "awaiting_payment"].includes(status) && (
        <ActionDialog
          title="Cancel order"
          description="Only for an order that has not been paid."
          trigger="Cancel order"
          action={cancelOrderAdminAction}
          id={id}
          submit="Cancel order"
          danger
        >
          <Reason />
        </ActionDialog>
      )}
      <ActionDialog
        title="Add an internal note"
        description="Only your team sees this."
        trigger="Add note"
        action={addOrderNoteAction}
        id={id}
        submit="Save note"
        danger
      >
        <Field label="Note" htmlFor="note">
          <Textarea
            id="note"
            name="note"
            rows={3}
            required
            minLength={2}
            maxLength={1000}
          />
        </Field>
      </ActionDialog>
      {["paid", "fulfilling", "delivered", "refunded", "review"].includes(
        status,
      ) && (
        <ToastForm action={resendOrderEmailAction}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="outline" size="sm" pending="Sending…">
            Resend email
          </SubmitButton>
        </ToastForm>
      )}
      {isAdmin && hasDelivery && paidStates.includes(status) && (
        <AdminReveal id={id} />
      )}
    </div>
  );
}

function AdminReveal({ id }: { id: string }) {
  const [r, setR] = useState<AdminRevealResult | null>(null);
  const [pending, start] = useTransition();
  const d = r?.ok ? r.delivery : undefined;
  return (
    <Dialog onOpenChange={(o) => !o && setR(null)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reveal code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customer&apos;s code or token</DialogTitle>
          <DialogDescription>
            Every view is recorded in the audit log with your name.
          </DialogDescription>
        </DialogHeader>
        {!d ? (
          <>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => setR(await adminRevealAction(id)))
              }
            >
              {pending ? "Opening…" : "Show details"}
            </Button>
            {r && !r.ok && (
              <p role="alert" className="text-destructive-foreground text-sm">
                {r.error}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            {d.token && (
              <CopyField label="Token" value={d.token} mono emphasis />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
