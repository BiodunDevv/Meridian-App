"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  type LucideIcon,
  Mail,
  MessageSquare,
  Package,
  Plug,
  Receipt,
  RotateCcw,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Store,
  Tag,
  Tv,
  Users,
  Wallet,
  Wifi,
  Zap,
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

type Item = {
  title: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Also shown to staff. Everything else in the admin is for admins only. */
  staff?: boolean;
};
type Group = { label?: string; items: Item[] };

const customer: Group[] = [
  {
    items: [
      {
        title: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: "Shop",
    items: [
      {
        title: "Shop",
        href: "/dashboard/shop",
        icon: Store,
        exact: true,
      },
      { title: "Airtime", href: "/dashboard/shop/airtime", icon: Smartphone },
      { title: "Data", href: "/dashboard/shop/data", icon: Wifi },
      { title: "Electricity", href: "/dashboard/shop/electricity", icon: Zap },
      { title: "Cable TV", href: "/dashboard/shop/tv", icon: Tv },
    ],
  },
  {
    label: "My orders",
    items: [
      { title: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
      { title: "Store credit", href: "/dashboard/transactions", icon: Receipt },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Notifications", href: "/dashboard/notifications", icon: Bell },
      { title: "Support", href: "/dashboard/support", icon: LifeBuoy },
      { title: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
  {
    label: "Help",
    items: [
      { title: "Refund policy", href: "/refunds", icon: RotateCcw },
      { title: "Crypto payment risks", href: "/risk", icon: ShieldAlert },
    ],
  },
];

const admin: Group[] = [
  {
    items: [
      {
        title: "Overview",
        href: "/admin",
        icon: LayoutDashboard,
        exact: true,
        staff: true,
      },
      { title: "Users", href: "/admin/users", icon: Users },
      { title: "Messages", href: "/admin/messages", icon: MessageSquare },
      { title: "Support", href: "/admin/support", icon: LifeBuoy, staff: true },
    ],
  },
  {
    label: "Shop",
    items: [
      {
        title: "Orders",
        href: "/admin/orders",
        icon: ShoppingBag,
        staff: true,
      },
      { title: "Catalogue", href: "/admin/catalogue", icon: Package },
      { title: "Pricing", href: "/admin/pricing", icon: Tag },
      { title: "Providers", href: "/admin/providers", icon: Plug },
      { title: "Reconciliation", href: "/admin/reconciliation", icon: Scale },
      { title: "Reports", href: "/admin/reports", icon: BarChart3 },
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

export function pageTitle(variant: "customer" | "admin", pathname: string) {
  const groups = variant === "admin" ? admin : customer;
  const all = groups.flatMap((g) => g.items);
  const hit = [...all]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)));
  return hit?.title ?? "";
}

export function AppSidebar({
  variant,
  badges = {},
  role,
}: {
  variant: "customer" | "admin";
  badges?: Record<string, number>;
  role?: string;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const all = variant === "admin" ? admin : customer;
  // Staff see only the screens they may use. This hides links; the pages and actions enforce the rule.
  const groups =
    variant === "admin" && role === "staff"
      ? all
          .map((g) => ({ ...g, items: g.items.filter((i) => i.staff) }))
          .filter((g) => g.items.length)
      : all;
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
