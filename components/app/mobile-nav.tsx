"use client";

import {
  Home,
  LifeBuoy,
  type LucideIcon,
  Receipt,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items: {
  title: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  primary?: boolean;
}[] = [
  { title: "Home", href: "/dashboard", icon: Home, exact: true },
  { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
  {
    title: "Shop",
    href: "/dashboard/shop",
    icon: ShoppingBag,
    primary: true,
  },
  { title: "Orders", href: "/dashboard/orders", icon: Receipt },
  { title: "Account", href: "/dashboard/settings", icon: UserRound },
];

/** App-style bottom tab bar for phones: five equal tabs, raised Shop action, safe-area aware. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="bg-background/90 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid h-[60px] max-w-md grid-cols-5">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-full touch-manipulation flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors active:opacity-70",
                  active ? "text-brand" : "text-muted-foreground",
                )}
              >
                {item.primary ? (
                  <span className="relative block size-5">
                    <span
                      className={cn(
                        "bg-brand text-primary-foreground absolute -top-[22px] left-1/2 flex size-12 -translate-x-1/2 items-center justify-center rounded-full shadow-lg ring-[5px] ring-[var(--background)] transition-transform",
                        active && "scale-95",
                      )}
                    >
                      <item.icon className="size-5" aria-hidden="true" />
                    </span>
                  </span>
                ) : (
                  <item.icon
                    className={cn(
                      "size-5 transition-transform",
                      active && "scale-110",
                    )}
                    aria-hidden="true"
                  />
                )}
                <span className={cn("truncate", item.primary && "mt-0.5")}>
                  {item.title}
                </span>
                {active && !item.primary && (
                  <span
                    className="bg-brand absolute top-0 h-0.5 w-6 rounded-full"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
