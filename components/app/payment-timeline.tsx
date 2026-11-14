import { Check, Circle, Loader2, X } from "lucide-react";

import { formatDateTime } from "@/lib/money";
import { cn } from "@/lib/utils";

type Status =
  "awaiting" | "pending" | "approved" | "rejected" | "expired" | "cancelled";

/** Where the payment is, as a vertical timeline. Only states that really happened are marked done. */
export function PaymentTimeline({
  status,
  createdAt,
  submittedAt,
  reviewedAt,
  auto = false,
}: {
  status: Status;
  createdAt: string;
  submittedAt?: string;
  reviewedAt?: string;
  /** An online payment: steps are detected and confirmed by the network, not submitted and reviewed. */
  auto?: boolean;
}) {
  type S = {
    label: string;
    sub?: string;
    state: "done" | "current" | "todo" | "failed";
  };
  const stopped = status === "expired" || status === "cancelled";
  const steps: S[] = [
    { label: "Payment created", sub: formatDateTime(createdAt), state: "done" },
    {
      label: "Send your payment",
      sub: stopped
        ? status === "expired"
          ? "Time ran out"
          : "Cancelled"
        : status === "awaiting"
          ? "Waiting for you"
          : "Sent",
      state: stopped ? "failed" : status === "awaiting" ? "current" : "done",
    },
    {
      label: auto ? "Payment detected" : "Payment submitted",
      sub: submittedAt ? formatDateTime(submittedAt) : undefined,
      state:
        submittedAt || ["pending", "approved", "rejected"].includes(status)
          ? "done"
          : "todo",
    },
    {
      label: auto ? "Confirmed on the network" : "Verified by our team",
      sub:
        status === "pending"
          ? auto
            ? "Waiting for confirmations"
            : "In progress, usually within the hour"
          : status === "rejected"
            ? "Not confirmed"
            : undefined,
      state:
        status === "approved"
          ? "done"
          : status === "rejected"
            ? "failed"
            : status === "pending"
              ? "current"
              : "todo",
    },
    {
      label: "Credited to your balance",
      sub:
        status === "approved" && reviewedAt
          ? formatDateTime(reviewedAt)
          : undefined,
      state: status === "approved" ? "done" : "todo",
    },
  ];
  return <StepList steps={steps} />;
}

export type TimelineStep = {
  label: string;
  sub?: string;
  state: "done" | "current" | "todo" | "failed";
};

/** A vertical timeline of steps. Shared by deposits and withdrawals. */
export function StepList({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-px",
                s.state === "done" ? "bg-brand" : "bg-border",
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
              s.state === "done" &&
                "bg-brand border-brand text-primary-foreground",
              s.state === "current" && "border-brand text-brand bg-background",
              s.state === "failed" &&
                "border-destructive-foreground/50 text-destructive-foreground bg-background",
              s.state === "todo" && "text-muted-foreground bg-background",
            )}
          >
            {s.state === "done" ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : s.state === "current" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : s.state === "failed" ? (
              <X className="size-3.5" aria-hidden="true" />
            ) : (
              <Circle className="size-2" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0 text-sm">
            <p
              className={cn(
                "font-medium",
                s.state === "todo" && "text-muted-foreground",
              )}
            >
              {s.label}
            </p>
            {s.sub && <p className="text-muted-foreground text-xs">{s.sub}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
