"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";

import { revealDeliveryAction, type RevealResult } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";

import { CopyField } from "./copy-field";

/**
 * Shows the code or token of a delivered order, only when the owner asks. The details are fetched on demand,
 * kept in memory, and cleared when the owner hides them or leaves the page.
 */
export function DeliveryReveal({
  orderId,
  viewOnce,
}: {
  orderId: string;
  viewOnce: boolean;
}) {
  const [result, setResult] = useState<RevealResult | null>(null);
  const [pending, start] = useTransition();
  const d = result?.ok ? result.delivery : undefined;

  return (
    <div className="space-y-3">
      {!d && (
        <>
          <p className="text-muted-foreground text-sm">
            {viewOnce
              ? "For your safety this can be shown only once. Have somewhere ready to copy it to."
              : "Your code or token is hidden until you ask for it. Each time you open it is recorded."}
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => setResult(await revealDeliveryAction(orderId)))
            }
          >
            <Eye /> {pending ? "Opening…" : "Show details"}
          </Button>
          {result && !result.ok && (
            <p role="alert" className="text-destructive-foreground text-sm">
              {result.error}
            </p>
          )}
        </>
      )}
      {d && (
        <div className="space-y-3">
          {d.token && <CopyField label="Token" value={d.token} mono emphasis />}
          {d.units && (
            <p className="text-muted-foreground text-xs">Units: {d.units}</p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setResult(null)}
          >
            <EyeOff /> Hide
          </Button>
        </div>
      )}
    </div>
  );
}
