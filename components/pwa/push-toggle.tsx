"use client";

import { Bell, BellOff, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/actions/user";
import { Button } from "@/components/ui/button";

type State =
  "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Enable or disable web push on this device. Handles iOS (needs the app installed first). */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        !publicKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = window.matchMedia(
          "(display-mode: standalone)",
        ).matches;
        return setState(ios && !standalone ? "needs-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, [publicKey]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        return setState(permission === "denied" ? "denied" : "off");
      const reg =
        (await navigator.serviceWorker.getRegistration("/")) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(publicKey),
        }));
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const r = await savePushSubscriptionAction(json);
      if (r.ok) {
        toast.success(r.message);
        setState("on");
      } else toast.error(r.error);
    } catch {
      toast.error(
        "Could not turn on notifications. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      toast.success("Notifications are off for this device.");
      setState("off");
    } catch {
      toast.error("Could not turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking")
    return (
      <p className="text-muted-foreground text-sm">Checking this device…</p>
    );
  if (state === "needs-install")
    return (
      <p className="flex items-start gap-2 text-sm">
        <Smartphone
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <span className="text-muted-foreground">
          On iPhone, notifications work once Meridian is added to your Home
          Screen (iOS 16.4 or later). Tap Share, choose “Add to Home Screen”,
          then open the app and come back here.
        </span>
      </p>
    );
  if (state === "unsupported")
    return (
      <p className="text-muted-foreground text-sm">
        This browser does not support push notifications. You will still get
        emails and in-app alerts.
      </p>
    );
  if (state === "denied")
    return (
      <p className="text-muted-foreground text-sm">
        Notifications are blocked for this site. Allow them in your browser or
        phone settings, then reload this page.
      </p>
    );

  return state === "on" ? (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-success flex items-center gap-2 text-sm">
        <Bell className="size-4" aria-hidden="true" /> On for this device
      </p>
      <Button variant="outline" size="sm" disabled={busy} onClick={disable}>
        <BellOff /> Turn off
      </Button>
    </div>
  ) : (
    <Button disabled={busy} onClick={enable}>
      <Bell /> {busy ? "Turning on…" : "Turn on notifications"}
    </Button>
  );
}
