"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

const noop = () => () => {};

/** Referral link with copy and native share (phones). */
export function ShareReferral({ code }: { code: string }) {
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator !== "undefined" && "share" in navigator,
    () => false,
  );
  const [done, setDone] = useState(false);
  const link = `${origin}/register?ref=${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {}
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted/50 min-w-0 flex-1 rounded-lg border px-3 py-2.5 font-mono text-sm break-all">
          {link}
        </div>
        <Button type="button" onClick={copy} variant="outline" size="lg">
          {done ? <Check /> : <Copy />} {done ? "Copied" : "Copy link"}
        </Button>
        {canShare && (
          <Button
            type="button"
            size="lg"
            onClick={() =>
              navigator
                .share({
                  title: "Join me on Meridian",
                  text: "Create your Meridian account with my link.",
                  url: link,
                })
                .catch(() => {})
            }
          >
            <Share2 /> Share
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Your code:{" "}
        <span className="text-foreground font-mono font-semibold tracking-wider">
          {code}
        </span>
      </p>
    </div>
  );
}
