import { Check, Circle, Gift, Loader2 } from "lucide-react";

import { StatusBadge } from "@/components/app/ui";
import { cn } from "@/lib/utils";

const steps = [
  {
    label: "Order created",
    sub: "Details checked, price locked",
    state: "done",
  },
  {
    label: "Awaiting payment",
    sub: "Pay the exact amount shown",
    state: "current",
  },
  {
    label: "Payment confirmed",
    sub: "Confirmed on the network",
    state: "todo",
  },
  { label: "Delivered", sub: "Shown here and sent by email", state: "todo" },
] as const;

/**
 * An illustration of the order page. It uses the same status badge as the app and
 * deliberately shows no amounts, names or counts, so nothing in it can read as real activity.
 */
export function OrderStatusMockup() {
  return (
    <div className="bg-background w-full p-4 text-left sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-lg">
            <Gift className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Example order</p>
            <p className="text-muted-foreground text-xs">
              Illustration, not a real order
            </p>
          </div>
        </div>
        <StatusBadge status="awaiting" label="Awaiting payment" />
      </div>
      <ol className="mt-5 flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3">
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="bg-border absolute top-6 bottom-[-1rem] left-[11px] w-px"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border",
                s.state === "done" &&
                  "border-success/50 bg-success/10 text-success",
                s.state === "current" && "border-brand bg-brand/10 text-brand",
                s.state === "todo" && "text-muted-foreground bg-background",
              )}
            >
              {s.state === "done" ? (
                <Check className="size-3.5" />
              ) : s.state === "current" ? (
                <Loader2 className="size-3.5" />
              ) : (
                <Circle className="size-2.5" />
              )}
            </span>
            <div>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-muted-foreground text-xs">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
