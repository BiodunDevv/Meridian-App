"use client";

import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  name,
  username,
  email,
  admin,
  showDashboard = false,
}: {
  name: string;
  username?: string;
  email: string;
  admin: boolean;
  /** Adds a Dashboard link, for use on the public pages. */
  showDashboard?: boolean;
}) {
  const initials = (name || email).slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="hover:bg-accent focus-visible:ring-ring flex items-center gap-2 rounded-full p-0.5 outline-none focus-visible:ring-2 md:rounded-lg md:py-1 md:pr-2 md:pl-1"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-brand/10 text-brand text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 text-left leading-tight md:block">
          <span className="block max-w-36 truncate text-sm font-medium">
            {username ? `@${username}` : name || "Account"}
          </span>
          <span className="text-muted-foreground block max-w-36 truncate text-[11px]">
            {admin ? "Administrator" : "Customer"}
          </span>
        </span>
        <ChevronDown
          className="text-muted-foreground hidden size-3.5 md:block"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">
            {username ? `@${username}` : name || "Your account"}
          </div>
          <div className="text-muted-foreground truncate text-xs">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showDashboard && (
          <DropdownMenuItem asChild>
            <Link href={admin ? "/admin" : "/dashboard"}>
              <LayoutDashboard /> Dashboard
            </Link>
          </DropdownMenuItem>
        )}
        {!admin && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
        )}
        {admin && (
          <DropdownMenuItem asChild>
            <Link href="/admin/settings">
              <ShieldCheck /> Admin settings
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut /> Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
