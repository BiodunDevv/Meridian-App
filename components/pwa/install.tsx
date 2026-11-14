"use client";

import {
  CheckCircle2,
  Download,
  MonitorSmartphone,
  Share,
  SquarePlus,
  Zap,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

interface Ctx {
  /** The browser can show its own install prompt (Chrome, Edge, Android). */
  canPrompt: boolean;
  /** iPhone or iPad Safari, where installing means Share then Add to Home Screen. */
  isIos: boolean;
  installed: boolean;
  install: () => Promise<void>;
}

const InstallContext = createContext<Ctx | null>(null);
const SNOOZE_KEY = "apx_install_snooze_until";
const WEEK = 7 * 24 * 60 * 60 * 1000;
const noop = () => () => {};

export function useInstall() {
  const ctx = useContext(InstallContext);
  if (!ctx) throw new Error("useInstall must be used inside InstallProvider");
  return ctx;
}

/** Captures the browser's install prompt as soon as it fires, so any screen can offer installing. */
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [event, setEvent] = useState<PromptEvent | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);
  const standalone = useSyncExternalStore(
    noop,
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true,
    () => false,
  );
  const isIos = useSyncExternalStore(
    noop,
    () =>
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios|fxios/i.test(navigator.userAgent),
    () => false,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as PromptEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setJustInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    setEvent(null);
    if (choice.outcome === "accepted") toast.success("Installing Meridian…");
  }

  return (
    <InstallContext.Provider
      value={{
        canPrompt: Boolean(event),
        isIos,
        installed: standalone || justInstalled,
        install,
      }}
    >
      {children}
    </InstallContext.Provider>
  );
}

const PERKS = [
  { icon: Zap, text: "Opens instantly, like any other app" },
  { icon: MonitorSmartphone, text: "Full screen with no browser bars" },
  { icon: CheckCircle2, text: "Get deposit and payout alerts" },
];

function IosSteps() {
  return (
    <ol className="space-y-3 text-sm">
      <li className="flex items-center gap-3">
        <span className="bg-brand/10 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Share className="size-4" aria-hidden="true" />
        </span>
        <span>
          Tap the <strong>Share</strong> button in Safari
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="bg-brand/10 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
          <SquarePlus className="size-4" aria-hidden="true" />
        </span>
        <span>
          Choose <strong>Add to Home Screen</strong>
        </span>
      </li>
      <li className="flex items-center gap-3">
        <span className="bg-brand/10 text-brand flex size-8 shrink-0 items-center justify-center rounded-lg">
          <CheckCircle2 className="size-4" aria-hidden="true" />
        </span>
        <span>Open Meridian from your Home Screen</span>
      </li>
    </ol>
  );
}

/**
 * "Install Meridian" as a modal. If skipped, it comes back after a week. `allowed` lets the layout hold it back
 * while another first-run prompt (username, two-step login) is showing.
 */
export function InstallModal({ allowed }: { allowed: boolean }) {
  const { canPrompt, isIos, installed, install } = useInstall();
  const [open, setOpen] = useState(false);
  const eligible = allowed && !installed && (canPrompt || isIos);

  useEffect(() => {
    if (!eligible) return;
    let until = 0;
    try {
      until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    } catch {}
    if (until > Date.now()) return;
    const t = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(t);
  }, [eligible]);

  function later() {
    setOpen(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + WEEK));
    } catch {}
  }

  return (
    <Dialog
      open={open && eligible}
      onOpenChange={(o) => (o ? setOpen(true) : later())}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center sm:text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/pwa-icon/192"
            alt=""
            width={64}
            height={64}
            className="mb-1 size-16 rounded-2xl shadow-md"
          />
          <DialogTitle>Install Meridian</DialogTitle>
          <DialogDescription>
            {isIos && !canPrompt
              ? "Add Meridian to your Home Screen for the best experience."
              : "Get the app on your device for a faster, full-screen experience."}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2.5 text-sm">
          {PERKS.map((p) => (
            <li key={p.text} className="flex items-center gap-3">
              <p.icon
                className="text-brand size-4 shrink-0"
                aria-hidden="true"
              />
              {p.text}
            </li>
          ))}
        </ul>
        {isIos && !canPrompt && <IosSteps />}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {canPrompt && (
            <Button
              size="lg"
              onClick={async () => {
                setOpen(false);
                await install();
              }}
            >
              <Download /> Install app
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={later}>
            {isIos && !canPrompt ? "Got it" : "Not now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** For Settings: install whenever you like, or see that it is already installed. */
export function InstallPanel() {
  const { canPrompt, isIos, installed, install } = useInstall();
  const [steps, setSteps] = useState(false);

  if (installed) {
    return (
      <p className="text-success flex items-center gap-2 text-sm">
        <CheckCircle2 className="size-4" aria-hidden="true" /> Meridian is
        installed on this device.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="text-muted-foreground space-y-1.5 text-sm">
        {PERKS.map((p) => (
          <li key={p.text} className="flex items-center gap-2.5">
            <p.icon className="size-4 shrink-0" aria-hidden="true" /> {p.text}
          </li>
        ))}
      </ul>
      {canPrompt ? (
        <Button onClick={install}>
          <Download /> Install app
        </Button>
      ) : isIos ? (
        <>
          <Button
            onClick={() => setSteps((v) => !v)}
            variant={steps ? "outline" : "default"}
          >
            <Share /> How to install
          </Button>
          {steps && <IosSteps />}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          Your browser has not offered installation yet. In Chrome or Edge, look
          for the install icon in the address bar, or open the browser menu and
          choose “Install Meridian”. Installing needs a secure (https)
          connection.
        </p>
      )}
    </div>
  );
}
