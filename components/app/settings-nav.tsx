"use client";

import {
  Bell,
  Fingerprint,
  Laptop,
  ShieldCheck,
  Store,
  User,
  Wallet,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const ICONS = {
  user: User,
  shield: ShieldCheck,
  identity: Fingerprint,
  bell: Bell,
  devices: Laptop,
  store: Store,
  wallet: Wallet,
  tools: Wrench,
};

/** Icons are passed by name, because a server page cannot hand component functions to a client component. */
export type SettingsNavItem = {
  id: string;
  label: string;
  icon: keyof typeof ICONS;
};

/** Section links for the settings page. A side list on large screens, a scrolling strip on phones. */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Settings sections"
      className="bg-background/90 sticky top-0 z-20 -mx-4 border-b px-4 py-2 backdrop-blur md:-mx-6 md:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0"
    >
      <ul className="flex gap-1 overflow-x-auto lg:sticky lg:top-6 lg:flex-col lg:overflow-visible">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "true" : undefined}
              onClick={() => setActive(i.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                active === i.id
                  ? "bg-brand/10 text-brand font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {(() => {
                const Icon = ICONS[i.icon];
                return <Icon className="size-4" aria-hidden="true" />;
              })()}
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
