"use client";

import {
  CircleHelp,
  LayoutDashboard,
  ListOrdered,
  LogIn,
  type LucideIcon,
  Menu,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { UserMenu } from "@/components/app/user-menu";
import { appLinks, brand, nav } from "@/content/site";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";

import Meridian from "../../logos/meridian";
import { Button } from "../../ui/button";
import { ModeToggle } from "../../ui/mode-toggle";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../../ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../ui/tooltip";

const ICONS: Record<string, LucideIcon> = {
  features: ShoppingBag,
  "how-it-works": ListOrdered,
  delivery: Truck,
  security: ShieldCheck,
  faq: CircleHelp,
};

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

const sectionIds = nav.links.map((l) => l.id);

/** Hairline that follows the header edge. It uses the inverted foreground, so it reads on either surface. */
const EDGE = "color-mix(in oklab, var(--foreground) 16%, transparent)";

/**
 * One of the two curved corners that join the short side bars (40px) to the tall centre notch (64px).
 * `flip` mirrors it for the right side. The fill is the header colour, the stroke is the hairline.
 */
function Corner({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 50 56"
      preserveAspectRatio="none"
      className="pointer-events-auto -mx-px h-14 w-5 shrink-0 lg:w-10"
    >
      <path
        d={
          flip
            ? "M0 0 H50 V32 C25 32 25 56 0 56 Z"
            : "M0 0 H50 V56 C25 56 25 32 0 32 Z"
        }
        fill="var(--background)"
      />
      <path
        d={
          flip
            ? "M0 55.5 C25 55.5 25 31.5 50 31.5"
            : "M0 31.5 C25 31.5 25 55.5 50 55.5"
        }
        fill="none"
        stroke={EDGE}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function Navbar() {
  const scrolled = useScrolled();
  const active = useActiveSection(sectionIds);
  const [open, setOpen] = useState(false);
  const { signedIn, me, dashboardHref } = useMe();

  const link = (id: string) =>
    cn(
      "text-muted-foreground hover:text-foreground hover:bg-foreground/10 flex size-9 items-center justify-center rounded-full transition-colors",
      active === id && "text-foreground bg-foreground/10",
    );

  return (
    <TooltipProvider delayDuration={150}>
      <header
        className={cn(
          // The inverted theme: dark in light mode, light in dark mode. See `.invert-theme` in globals.css.
          "invert-theme text-foreground pointer-events-none sticky top-0 z-50 h-14 transition-[filter] duration-300",
          scrolled
            ? "drop-shadow-[0_8px_16px_rgba(10,18,48,0.22)]"
            : "drop-shadow-[0_2px_6px_rgba(10,18,48,0.10)]",
        )}
      >
        <div className="flex h-14">
          {/* Left bar */}
          <div
            aria-hidden="true"
            className="bg-background pointer-events-auto h-8 min-w-0 flex-1 border-b"
            style={{ borderColor: EDGE }}
          />
          <Corner />

          {/* The notch */}
          <div
            className="bg-background pointer-events-auto relative -mx-px flex h-14 min-w-0 flex-[0_1_760px] items-center border-b"
            style={{ borderColor: EDGE }}
          >
            <nav
              aria-label="Main"
              className="flex w-full items-center justify-between gap-2 px-1 sm:px-3 lg:px-5"
            >
              <Link
                href="/"
                aria-label={brand.name}
                className="flex shrink-0 items-center text-xl"
              >
                <Meridian />
              </Link>

              <div className="hidden items-center gap-1 lg:flex">
                {nav.links.map((l) => {
                  const Icon = ICONS[l.id];
                  if (!Icon) return null;
                  return (
                    <Tooltip key={l.id}>
                      <TooltipTrigger asChild>
                        <a
                          href={l.href}
                          aria-label={l.text}
                          aria-current={active === l.id ? "true" : undefined}
                          className={link(l.id)}
                        >
                          <Icon className="size-[18px]" aria-hidden="true" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{l.text}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <ModeToggle />
                {signedIn ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={dashboardHref}
                          aria-label="Dashboard"
                          className={cn(link(""), "hidden sm:flex")}
                        >
                          <LayoutDashboard
                            className="size-[18px]"
                            aria-hidden="true"
                          />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Dashboard</TooltipContent>
                    </Tooltip>
                    {me && (
                      <UserMenu
                        name={me.name}
                        username={me.username}
                        email={me.email}
                        admin={me.role === "admin" || me.role === "staff"}
                        showDashboard
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={appLinks.login}
                          aria-label={nav.login}
                          className={cn(link(""), "hidden sm:flex")}
                        >
                          <LogIn className="size-[18px]" aria-hidden="true" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{nav.login}</TooltipContent>
                    </Tooltip>
                    <Button
                      asChild
                      size="sm"
                      className="hidden rounded-full sm:inline-flex"
                    >
                      <a href={appLinks.register}>{nav.getStarted}</a>
                    </Button>
                  </>
                )}
                <Sheet open={open} onOpenChange={setOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 lg:hidden"
                      aria-label={nav.menu}
                    >
                      <Menu className="size-5" aria-hidden="true" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="right"
                    aria-describedby={undefined}
                    className="invert-theme"
                  >
                    <SheetTitle className="sr-only">{nav.menuTitle}</SheetTitle>
                    <nav
                      aria-label="Mobile"
                      className="mt-10 grid gap-1 text-base font-medium"
                    >
                      {nav.links.map((l) => {
                        const Icon = ICONS[l.id];
                        return (
                          <a
                            key={l.id}
                            href={l.href}
                            onClick={() => setOpen(false)}
                            className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 flex items-center gap-3 rounded-lg px-3 py-3 transition-colors"
                          >
                            {Icon && (
                              <Icon
                                className="size-5 opacity-70"
                                aria-hidden="true"
                              />
                            )}
                            {l.text}
                          </a>
                        );
                      })}
                      <div className="mt-4 flex flex-col gap-3 border-t pt-4">
                        {signedIn ? (
                          <Button size="lg" asChild>
                            <Link
                              href={dashboardHref}
                              onClick={() => setOpen(false)}
                            >
                              <LayoutDashboard /> Go to dashboard
                            </Link>
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="lg" asChild>
                              <a href={appLinks.login}>{nav.login}</a>
                            </Button>
                            <Button size="lg" asChild>
                              <a href={appLinks.register}>{nav.getStarted}</a>
                            </Button>
                          </>
                        )}
                      </div>
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            </nav>
          </div>

          <Corner flip />
          {/* Right bar */}
          <div
            aria-hidden="true"
            className="bg-background pointer-events-auto h-8 min-w-0 flex-1 border-b"
            style={{ borderColor: EDGE }}
          />
        </div>
      </header>
    </TooltipProvider>
  );
}
