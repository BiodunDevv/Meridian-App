import { Lock } from "lucide-react";

import { formatDateTime } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Msg {
  _id: string;
  authorRole: "user" | "admin";
  body: string;
  internal?: boolean;
  createdAt: string;
}

/** Chat-style thread. "mine" bubbles sit on the right in brand blue. */
export function TicketThread({
  messages,
  viewer,
}: {
  messages: Msg[];
  viewer: "user" | "admin";
}) {
  return (
    <ol className="flex flex-col gap-3" aria-label="Conversation">
      {messages.map((m) => {
        const mine = m.authorRole === viewer;
        if (m.internal) {
          return (
            <li
              key={m._id}
              className="border-gold/50 bg-gold/10 mx-auto w-full max-w-[85%] rounded-xl border px-4 py-3 text-sm"
            >
              <p className="text-gold-foreground mb-1 flex items-center gap-1.5 text-xs font-semibold">
                <Lock className="size-3" aria-hidden="true" /> Internal note,
                not visible to the user
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {formatDateTime(m.createdAt)}
              </p>
            </li>
          );
        }
        return (
          <li
            key={m._id}
            className={cn("flex", mine ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                mine
                  ? "bg-brand text-primary-foreground rounded-br-md"
                  : "bg-secondary rounded-bl-md",
              )}
            >
              <p
                className={cn(
                  "mb-0.5 text-[11px] font-medium",
                  mine ? "text-primary-foreground/80" : "text-muted-foreground",
                )}
              >
                {viewer === "admin"
                  ? m.authorRole === "admin"
                    ? "You (support)"
                    : "Customer"
                  : m.authorRole === "admin"
                    ? "Meridian support"
                    : "You"}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  mine ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {formatDateTime(m.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
