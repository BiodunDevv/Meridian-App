"use client";

import { useState } from "react";

import { recordTopUpAction, saveProviderAction } from "@/app/actions/catalogue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { ActionForm, Field, SubmitButton, TextField } from "./form";
import { IconSelect } from "./icon-input";

/** Provider settings (mode, priority, low-balance threshold) and a float top-up record. */
export function ProviderDialog({
  trigger,
  provider,
}: {
  trigger: React.ReactNode;
  provider: {
    id: string;
    key: string;
    name: string;
    mode: "sandbox" | "live";
    priority: number;
    low: string;
    isMock: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(provider.mode);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{provider.name}</DialogTitle>
          <DialogDescription>
            Switching between sandbox and live changes only the mode. Keys come
            from the server environment.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={saveProviderAction}
          resetOnSuccess={false}
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="id" value={provider.id} />
          <Field label="Mode" htmlFor="mode">
            <IconSelect
              name="mode"
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as "sandbox" | "live")}
            >
              <option value="sandbox">Sandbox (test money)</option>
              {!provider.isMock && (
                <option value="live">Live (real money)</option>
              )}
            </IconSelect>
          </Field>
          {mode === "live" && provider.mode !== "live" && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="confirmLive"
                className="mt-1 size-4"
              />
              I understand live mode spends real money.
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              name="priority"
              label="Failover priority"
              type="number"
              min="0"
              max="99"
              defaultValue={provider.priority}
              hint="Lower is tried first."
            />
            <TextField
              name="low"
              label="Low-balance alert (provider currency)"
              type="number"
              step="0.01"
              min="0"
              defaultValue={provider.low}
              hint="0 turns it off."
            />
          </div>
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </ActionForm>
        <div className="border-t pt-4">
          <p className="mb-2 text-sm font-medium">Record a float top-up</p>
          <ActionForm action={recordTopUpAction}>
            <input type="hidden" name="key" value={provider.key} />
            <TextField
              name="amount"
              label="Amount paid in (provider currency)"
              type="number"
              step="0.01"
              min="0"
            />
            <TextField name="note" label="Note (optional)" />
            <SubmitButton variant="outline" pending="Recording…">
              Record top-up
            </SubmitButton>
          </ActionForm>
        </div>
      </DialogContent>
    </Dialog>
  );
}
