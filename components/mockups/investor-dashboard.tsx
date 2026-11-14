import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Layers,
  LayoutDashboard,
  LineChart,
  Receipt,
  Settings,
  Wallet,
} from "lucide-react";

import { dashboards } from "@/content/site";
import { cn } from "@/lib/utils";

import Meridian from "../logos/meridian";
import { GrowthChart } from "./chart";

const icons = [
  LayoutDashboard,
  Wallet,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Receipt,
  Bell,
  Settings,
];

const growth = [38, 40, 39, 44, 47, 46, 52, 55, 54, 60, 63, 62, 69, 72, 78];

const transactions = [
  {
    label: "Deposit confirmed",
    meta: "USDT · TRC20",
    amount: "+$2,500.00",
    up: true,
  },
  {
    label: "Invested in Growth",
    meta: "30-day plan",
    amount: "-$1,000.00",
    up: false,
  },
  { label: "Daily accrual", meta: "Growth plan", amount: "+$4.93", up: true },
];

export function InvestorDashboard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground flex w-full text-left",
        className,
      )}
    >
      <aside className="border-border dark:border-border/10 hidden w-44 shrink-0 flex-col gap-1 border-r p-3 md:flex">
        <div className="mb-3 px-2">
          <Meridian className="text-base" />
        </div>
        {dashboards.sidebar.map((item, i) => {
          const Icon = icons[i];
          return (
            <div
              key={item}
              className={cn(
                "text-muted-foreground flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium",
                i === 0 && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {item}
            </div>
          );
        })}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Overview</div>
          <span className="border-gold/50 text-gold-foreground rounded-full border px-2 py-0.5 text-[10px] font-semibold">
            {dashboards.sampleLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Portfolio value", "$12,480.20"],
            ["Available", "$3,120.00"],
            ["Invested", "$9,000.00"],
            ["Profit / loss", "+$360.20"],
          ].map(([label, value], i) => (
            <div
              key={label}
              className="border-border dark:border-border/10 rounded-lg border p-3"
            >
              <div className="text-muted-foreground text-[11px]">{label}</div>
              <div
                className={cn(
                  "mt-1 text-sm font-semibold sm:text-base",
                  i === 3 && "text-success",
                )}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="border-border dark:border-border/10 rounded-lg border p-3 lg:col-span-3">
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[11px]">
              <LineChart className="size-3.5" /> Portfolio growth · 30 days
            </div>
            <div className="h-28 sm:h-32">
              <GrowthChart points={growth} />
            </div>
          </div>
          <div className="border-border dark:border-border/10 rounded-lg border p-3 lg:col-span-2">
            <div className="text-muted-foreground mb-2 text-[11px]">
              Recent transactions
            </div>
            <ul className="flex flex-col gap-2.5">
              {transactions.map((t) => (
                <li
                  key={t.label}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {t.label}
                    </span>
                    <span className="text-muted-foreground block truncate text-[10px]">
                      {t.meta}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      t.up ? "text-success" : "text-foreground",
                    )}
                  >
                    {t.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
