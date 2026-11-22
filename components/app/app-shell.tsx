import { Bell } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";

import { InstallModal, InstallProvider } from "@/components/pwa/install";
import { OnlineStatus } from "@/components/pwa/online-status";
import { RegisterServiceWorker } from "@/components/pwa/pwa";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionUser } from "@/lib/auth/session";

import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";
import { PageTitle } from "./page-title";
import { UserMenu } from "./user-menu";

export function AppShell({
  user,
  variant,
  unread = 0,
  badges,
  installAllowed = false,
  ticker,
  children,
}: {
  user: SessionUser;
  variant: "customer" | "admin";
  unread?: number;
  badges?: Record<string, number>;
  /** Hold the install modal back while another first-run prompt is showing. */
  installAllowed?: boolean;
  ticker?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Wrap = variant === "customer" ? InstallProvider : Fragment;
  return (
    <Wrap>
      <div className="overflow-hidden pt-[env(safe-area-inset-top)]">
        <SidebarProvider className="relative h-svh">
          <AppSidebar variant={variant} badges={badges} role={user.role} />
          <SidebarInset className="min-w-0 md:peer-data-[variant=inset]:ml-0">
            {ticker}
            <OnlineStatus />
            <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4 backdrop-blur md:px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger />
                <Separator orientation="vertical" className="h-4 self-center" />
                <PageTitle variant={variant} />
              </div>
              <div className="flex items-center gap-1.5">
                <ModeToggle />
                {variant === "customer" && (
                  <Link
                    href="/dashboard/notifications"
                    aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                    className="hover:bg-accent relative inline-flex size-9 items-center justify-center rounded-md"
                  >
                    <Bell className="size-[18px]" />
                    {unread > 0 && (
                      <span className="bg-gold absolute top-1.5 right-1.5 size-2 rounded-full" />
                    )}
                  </Link>
                )}
                <Separator
                  orientation="vertical"
                  className="mx-1 h-4 self-center"
                />
                <UserMenu
                  name={user.name}
                  username={user.username}
                  email={user.email}
                  admin={variant === "admin"}
                />
              </div>
            </header>
            <main
              id="main"
              className={`flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto p-4 md:p-6 [&>*]:shrink-0 ${variant === "customer" ? "pb-28 md:pb-6" : ""}`}
            >
              {children}
            </main>
            {variant === "customer" && (
              <>
                <MobileNav />
                <RegisterServiceWorker />
                <InstallModal allowed={installAllowed} />
              </>
            )}
          </SidebarInset>
        </SidebarProvider>
      </div>
    </Wrap>
  );
}
