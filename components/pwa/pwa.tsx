"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

/** Registers the service worker (production only, so dev stays predictable). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const KEY = "apx_install_dismissed";

/** Small "Add to home screen" card. Chrome/Android uses the native prompt; iOS gets instructions. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(KEY));
    } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const t = isIos
      ? setTimeout(() => (setIos(true), setHidden(false)), 0)
      : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      if (t) clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  }

  if (hidden || (!event && !ios)) return null;
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-3 text-sm shadow-sm">
      <span className="bg-brand/10 text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
        {ios ? (
          <Share className="size-4" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Install Meridian</p>
        <p className="text-muted-foreground text-xs">
          {ios
            ? "Tap Share, then “Add to Home Screen” for a full-screen app."
            : "Add it to your home screen for a faster, full-screen experience."}
        </p>
      </div>
      {event && (
        <Button
          size="sm"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
            setHidden(true);
          }}
        >
          Install
        </Button>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <X />
      </Button>
    </div>
  );
}
