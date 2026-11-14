"use client";

import { LayoutDashboard, Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { UserMenu } from "@/components/app/user-menu";
import { appLinks, brand, nav } from "@/content/site";
import { useMe } from "@/lib/use-me";
import { cn } from "@/lib/utils";

import Meridian from "../../logos/meridian";
import { Button } from "../../ui/button";
import { ModeToggle } from "../../ui/mode-toggle";
import {
  Navbar as NavbarComponent,
  NavbarLeft,
  NavbarRight,
} from "../../ui/navbar";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../../ui/sheet";

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

export default function Navbar() {
  const scrolled = useScrolled();
  const active = useActiveSection(sectionIds);
  const [open, setOpen] = useState(false);
  const { signedIn, me, dashboardHref } = useMe();

  return (
    <header className="sticky top-0 z-50">
      <div
        className={cn(
          "bg-background/70 absolute inset-0 border-b border-transparent backdrop-blur-lg transition-colors",
          scrolled && "border-border dark:border-border/15",
        )}
      />
      <div className="max-w-container relative mx-auto px-4">
        <NavbarComponent aria-label="Main">
          <NavbarLeft className="gap-3">
            <Link
              href="/"
              aria-label={brand.name}
              className="flex items-center text-2xl"
            >
              <Meridian />
            </Link>
          </NavbarLeft>
          <div className="hidden items-center gap-1 lg:flex">
            {nav.links.map((link) => (
              <a
                key={link.id}
                href={link.href}
                aria-current={active === link.id ? "true" : undefined}
                className={cn(
                  "text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active === link.id && "text-foreground bg-accent/60",
                )}
              >
                {link.text}
              </a>
            ))}
          </div>
          <NavbarRight className="gap-2">
            <ModeToggle />
            {signedIn ? (
              <>
                <Button asChild className="hidden sm:inline-flex">
                  <Link href={dashboardHref}>
                    <LayoutDashboard /> Dashboard
                  </Link>
                </Button>
                {me && (
                  <UserMenu
                    name={me.name}
                    username={me.username}
                    email={me.email}
                    admin={me.role === "admin"}
                    showDashboard
                  />
                )}
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className="hidden sm:inline-flex"
                >
                  <a href={appLinks.login}>{nav.login}</a>
                </Button>
                <Button asChild className="hidden sm:inline-flex">
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
              <SheetContent side="right" aria-describedby={undefined}>
                <SheetTitle className="sr-only">{nav.menuTitle}</SheetTitle>
                <nav
                  aria-label="Mobile"
                  className="mt-10 grid gap-5 text-lg font-medium"
                >
                  {nav.links.map((link) => (
                    <a
                      key={link.id}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {link.text}
                    </a>
                  ))}
                  <div className="mt-2 flex flex-col gap-3">
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
          </NavbarRight>
        </NavbarComponent>
      </div>
    </header>
  );
}
