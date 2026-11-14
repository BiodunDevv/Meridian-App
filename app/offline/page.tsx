import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-full">
        <WifiOff className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">You are offline</h1>
      <p className="text-muted-foreground max-w-xs text-sm">
        Meridian needs a connection to show your balance. Check your network and
        try again.
      </p>
    </main>
  );
}
