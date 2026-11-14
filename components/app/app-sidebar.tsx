"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgePercent,
  Bell,
  Gift,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Mail,
  MessageSquare,
  PieChart,
  Receipt,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import Meridian, { MeridianMark } from "../logos/meridian";

type Item = { title: string; href: string; icon: LucideIcon; exact?: boolean };
type Group = { label?: string; items: Item[] };

const investor: Group[] = [
  {
    items: [
      {
        title: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
      { title: "My Portfolio", href: "/dashboard/portfolio", icon: PieChart },
      { title: "Investments", href: "/dashboard/investments", icon: Layers },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Deposit", href: "/dashboard/deposit", icon: ArrowDownToLine },
      { title: "Withdraw", href: "/dashboard/withdraw", icon: ArrowUpFromLine },
      { title: "Transactions", href: "/dashboard/transactions", icon: Receipt },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Notifications", href: "/dashboard/notifications", icon: Bell },
      { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
      { title: "Referrals", href: "/dashboard/referrals", icon: Gift },
      { title: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
];

const admin: Group[] = [
  {
    items: [
      { title: "Overview", href: "/admin", icon: LayoutDashboard, exact: true },
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Messages", href: "/admin/messages", icon: MessageSquare },
      { title: "Support", href: "/admin/support", icon: LifeBuoy },
      { title: "Investments", href: "/admin/investments", icon: Layers },
    ],
  },
  {
    label: "Money",
    items: [
      { title: "Deposits", href: "/admin/deposits", icon: ArrowDownToLine },
      {
        title: "Withdrawals",
        href: "/admin/withdrawals",
        icon: ArrowUpFromLine,
      },
      { title: "Transactions", href: "/admin/transactions", icon: Receipt },
      {
        title: "Payment methods",
        href: "/admin/payment-methods",
        icon: Wallet,
      },
      { title: "Plans", href: "/admin/plans", icon: BadgePercent },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Audit log", href: "/admin/audit", icon: ScrollText },
      { title: "Email log", href: "/admin/email-log", icon: Mail },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

export function pageTitle(variant: "investor" | "admin", pathname: string) {
  const groups = variant === "admin" ? admin : investor;
  const all = groups.flatMap((g) => g.items);
  const hit = [...all]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  return hit?.title ?? "";
}

export function AppSidebar({
  variant,
  badges = {},
}: {
  variant: "investor" | "admin";
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const groups = variant === "admin" ? admin : investor;
  const home = variant === "admin" ? "/admin" : "/dashboard";

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="h-14 justify-center">
        <SidebarMenuButton asChild size="lg">
          <Link href={home} onClick={() => setOpenMobile(false)}>
            <MeridianMark
              width={24}
              height={24}
              className="hidden group-data-[collapsible=icon]:block"
            />
            <Meridian className="text-lg group-data-[collapsible=icon]:hidden" />
            {variant === "admin" && (
              <span className="border-gold/60 text-gold-foreground ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold group-data-[collapsible=icon]:hidden">
                Admin
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group, i) => (
          <SidebarGroup key={i}>
            {group.label && (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            )}
            <SidebarMenu>
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const badge = badges[item.href];
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setOpenMobile(false)}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                        {badge ? (
                          <span className="bg-brand text-primary-foreground ml-auto rounded-full px-1.5 text-[10px] font-semibold group-data-[collapsible=icon]:hidden">
                            {badge}
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2 px-2 pb-3">
        <form action={logoutAction}>
          <SidebarMenuButton
            type="submit"
            tooltip="Log out"
            className="text-muted-foreground hover:text-destructive-foreground"
          >
            <LogOut />
            <span>Log out</span>
          </SidebarMenuButton>
        </form>
        {variant === "investor" && (
          <p className="text-muted-foreground px-2 text-[11px] leading-snug group-data-[collapsible=icon]:hidden">
            Capital at risk. Projected returns are illustrative.
          </p>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
