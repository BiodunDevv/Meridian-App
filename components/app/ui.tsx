import { CheckCircle2, Circle, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "positive" | "gold";
  className?: string;
}) {
  return (
    <Card className={cn("shadow-none", className)}>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
          {label}
          {Icon && <Icon className="size-4" aria-hidden="true" />}
        </div>
        <div
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            tone === "positive" && "text-success",
            tone === "gold" && "text-gold-foreground",
          )}
        >
          {value}
        </div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
      </CardContent>
    </Card>
  );
}

const tones: Record<string, string> = {
  pending: "border-gold/50 text-gold-foreground bg-gold/10",
  approved: "border-success/40 text-success bg-success/10",
  paid: "border-success/40 text-success bg-success/10",
  matured: "border-success/40 text-success bg-success/10",
  active: "border-brand/40 text-brand bg-brand/10",
  rejected:
    "border-destructive-foreground/40 text-destructive-foreground bg-destructive-foreground/10",
  suspended:
    "border-destructive-foreground/40 text-destructive-foreground bg-destructive-foreground/10",
  none: "text-muted-foreground",
  awaiting: "border-brand/40 text-brand bg-brand/10",
  processing: "border-brand/40 text-brand bg-brand/10",
  expired: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <Badge variant="outline" className={cn("capitalize", tones[status])}>
      {label ?? status}
    </Badge>
  );
}

const GHOST_ROWS = [
  ["w-24", "w-40", "w-14"],
  ["w-20", "w-32", "w-16"],
  ["w-28", "w-36", "w-12"],
  ["w-16", "w-44", "w-14"],
];

/** Faded placeholder rows that hint at what will fill the space. */
function GhostRows() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex flex-col gap-4 [mask-image:linear-gradient(to_bottom,black,transparent_85%)] p-5"
    >
      {GHOST_ROWS.map((row, i) => (
        <div key={i} className="flex items-center gap-3 opacity-70">
          <span className="bg-muted size-8 shrink-0 rounded-full" />
          <span className={cn("bg-muted h-2.5 rounded-full", row[0])} />
          <span
            className={cn(
              "bg-muted/70 hidden h-2.5 rounded-full sm:block",
              row[1],
            )}
          />
          <span className={cn("bg-muted ml-auto h-2.5 rounded-full", row[2])} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  variant?: "default" | "done";
}) {
  if (variant === "done") {
    return (
      <div className="bg-success/5 flex items-center gap-3 rounded-xl px-4 py-3.5">
        <span className="bg-success/10 text-success flex size-9 shrink-0 items-center justify-center rounded-full">
          <CheckCircle2 className="size-4" aria-hidden="true" />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {body && <p className="text-muted-foreground text-sm">{body}</p>}
        </div>
        {action}
      </div>
    );
  }
  const Glyph = Icon ?? Inbox;
  return (
    <div className="relative overflow-hidden rounded-xl border">
      <GhostRows />
      <div className="relative flex flex-col items-center gap-3 bg-[radial-gradient(ellipse_at_center,var(--background)_40%,transparent_85%)] px-6 py-14 text-center">
        <span className="bg-card text-brand ring-brand/15 flex size-12 items-center justify-center rounded-2xl shadow-sm ring-4">
          <Glyph className="size-5" aria-hidden="true" />
        </span>
        <div className="max-w-sm space-y-1">
          <p className="font-medium">{title}</p>
          {body && (
            <p className="text-muted-foreground text-sm text-pretty">{body}</p>
          )}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Checklist({
  title,
  description,
  steps,
}: {
  title: string;
  description?: string;
  steps: {
    label: string;
    hint: string;
    done: boolean;
    href: string;
    cta: string;
  }[];
}) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Panel title={title} description={description}>
      <div className="flex items-center gap-3 text-xs">
        <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
          <div
            className="bg-brand h-full transition-all"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <span className="text-muted-foreground tabular-nums">
          {done} of {steps.length}
        </span>
      </div>
      <ul className="divide-y">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 py-3">
            {s.done ? (
              <CheckCircle2
                className="text-success size-5 shrink-0"
                aria-label="Done"
              />
            ) : (
              <Circle
                className="text-muted-foreground size-5 shrink-0"
                aria-label="To do"
              />
            )}
            <div className="min-w-0 flex-1 text-sm">
              <p
                className={cn(
                  "font-medium",
                  s.done && "text-muted-foreground line-through",
                )}
              >
                {s.label}
              </p>
              {!s.done && (
                <p className="text-muted-foreground text-xs">{s.hint}</p>
              )}
            </div>
            {!s.done && (
              <Link
                href={s.href}
                className="text-brand shrink-0 text-sm font-medium underline-offset-4 hover:underline"
              >
                {s.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 shadow-none", className)}>
      <CardContent className="flex flex-col gap-4 p-5">
        {(title || description) && (
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            )}
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}

export const LEDGER_LABEL: Record<string, string> = {
  deposit: "Deposit",
  investment: "Investment",
  profit: "Profit payout",
  principal_return: "Principal returned",
  withdrawal_hold: "Withdrawal",
  withdrawal_refund: "Withdrawal refund",
  adjustment: "Adjustment",
  referral_bonus: "Referral reward",
};
