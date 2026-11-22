import {
  BarChart3,
  Mail,
  Package,
  Plug,
  Scale,
  ScrollText,
  Store,
  Tag,
  Wallet,
  Wrench,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  savePaymentSettingsAction,
  testPaymentsAction,
} from "@/app/actions/admin";
import { saveShopSettingsAction } from "@/app/actions/catalogue";
import { CopyField } from "@/components/app/copy-field";
import { ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { SettingsNav } from "@/components/app/settings-nav";
import {
  SettingsGroup,
  SettingsRow,
  SettingsRows,
} from "@/components/app/settings-ui";
import { ToastForm } from "@/components/app/toast-form";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { getEnv } from "@/lib/env";
import {
  paymentsConfigured,
  payoutsConfigured,
} from "@/lib/payments/nowpayments";
import { getPaymentSettings } from "@/lib/services/payments";
import { getShopSettings } from "@/lib/services/shop-settings";

export const metadata: Metadata = { title: "Settings" };

const NAV = [
  { id: "ordering", label: "Ordering", icon: "store" },
  { id: "payments", label: "Payments", icon: "wallet" },
  { id: "tools", label: "Tools", icon: "tools" },
] as const;

const TOOLS = [
  {
    href: "/admin/pricing",
    icon: Tag,
    title: "Pricing",
    body: "Markup, minimum margin and the naira rate.",
  },
  {
    href: "/admin/catalogue",
    icon: Package,
    title: "Catalogue",
    body: "Categories, products and what is on sale.",
  },
  {
    href: "/admin/providers",
    icon: Plug,
    title: "Providers",
    body: "Switch providers on or off, sandbox or live.",
  },
  {
    href: "/admin/payment-methods",
    icon: Wallet,
    title: "Payment methods",
    body: "Coins, networks and wallet addresses.",
  },
  {
    href: "/admin/reconciliation",
    icon: Scale,
    title: "Reconciliation",
    body: "Check orders against the payment provider.",
  },
  {
    href: "/admin/reports",
    icon: BarChart3,
    title: "Reports",
    body: "Revenue, cost, margin and refund rate.",
  },
  {
    href: "/admin/email-log",
    icon: Mail,
    title: "Email log",
    body: "Delivery, retries, bounces and complaints.",
  },
  {
    href: "/admin/audit",
    icon: ScrollText,
    title: "Audit log",
    body: "Every admin action on money, users and settings.",
  },
];

const Check = ({
  label,
  ok,
  hint,
}: {
  label: string;
  ok: boolean;
  hint: string;
}) => (
  <div className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm">
    <span
      className={`mt-1.5 size-2 shrink-0 rounded-full ${ok ? "bg-success" : "bg-muted-foreground/40"}`}
    />
    <span>
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground block text-xs">
        {ok ? "Connected" : `Set ${hint}`}
      </span>
    </span>
  </div>
);

const Toggle = ({
  name,
  checked,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  label: string;
  hint?: string;
}) => (
  <label className="flex items-start gap-3 text-sm">
    <input
      type="checkbox"
      name={name}
      defaultChecked={checked}
      className="mt-0.5 size-4"
    />
    <span>
      <span className="font-medium">{label}</span>
      {hint && (
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {hint}
        </span>
      )}
    </span>
  </label>
);

export default async function AdminSettings() {
  await requireAdmin();
  const [pay, shop] = await Promise.all([
    getPaymentSettings(),
    getShopSettings(),
  ]);
  const env = getEnv();
  const mode = paymentsConfigured()
    ? env.NOWPAYMENTS_SANDBOX === "true"
      ? "Sandbox (test money only)"
      : "Live"
    : "Manual review";

  return (
    <>
      <PageHeader
        title="Settings"
        description="Ordering, payments and the tools you use to run the shop."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav items={[...NAV]} />

        <div className="max-w-5xl min-w-0 space-y-10">
          <SettingsGroup
            id="ordering"
            icon={Store}
            title="Ordering"
            description="Whether customers can order, and how much and how often. The limits are placeholders until you decide them."
          >
            <ActionForm
              action={saveShopSettingsAction}
              resetOnSuccess={false}
              className="gap-4"
            >
              <SettingsRows>
                <SettingsRow
                  title="Ordering"
                  description="Open it only when fulfilment is ready. Paid orders wait until the order is placed with the provider."
                >
                  <Toggle
                    name="ordersOpen"
                    checked={shop.ordersOpen}
                    label="Ordering is open"
                    hint="Off by default. Customers see a notice while it is closed."
                  />
                </SettingsRow>
                <SettingsRow
                  title="Maintenance"
                  description="Pause new orders for a short time."
                >
                  <Toggle
                    name="maintenance"
                    checked={shop.maintenance}
                    label="Maintenance mode"
                    hint="Everything else keeps running, and orders already placed carry on."
                  />
                </SettingsRow>
                <SettingsRow
                  title="Daily spending limit"
                  description="Per customer, over a rolling 24 hours."
                >
                  <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                    <TextField
                      name="tier0"
                      label="Email verified only (USD)"
                      type="number"
                      min="1"
                      step="0.01"
                      defaultValue={shop.tier0DailyUsdCents / 100}
                      required
                    />
                    <TextField
                      name="tier1"
                      label="Identity verified (USD)"
                      type="number"
                      min="1"
                      step="0.01"
                      defaultValue={shop.tier1DailyUsdCents / 100}
                      required
                    />
                  </div>
                </SettingsRow>
                <SettingsRow
                  title="Order limits"
                  description="Keeps one customer from flooding the shop."
                >
                  <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
                    <TextField
                      name="perDay"
                      label="Orders per day"
                      type="number"
                      min="1"
                      defaultValue={shop.maxOrdersPerDay}
                      required
                    />
                    <TextField
                      name="maxOpen"
                      label="Unpaid at once"
                      type="number"
                      min="1"
                      defaultValue={shop.maxOpenOrders}
                      required
                    />
                    <TextField
                      name="windowMin"
                      label="Payment window (min)"
                      type="number"
                      min="10"
                      max="120"
                      defaultValue={shop.paymentWindowMin}
                      required
                    />
                  </div>
                </SettingsRow>
              </SettingsRows>
              <div className="flex justify-end">
                <SubmitButton pending="Saving…">Save ordering</SubmitButton>
              </div>
            </ActionForm>
          </SettingsGroup>

          <SettingsGroup
            id="payments"
            icon={Wallet}
            title="Payments"
            description="Crypto payments for orders, and the safety limits for automatic payouts."
          >
            <SettingsRows>
              <SettingsRow
                title="Connection"
                description={`Mode: ${mode}. ${payoutsConfigured() ? "Automatic payouts are available." : "Without a payout login, payouts stay manual."}`}
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Check
                      label="API key"
                      ok={Boolean(env.NOWPAYMENTS_API_KEY)}
                      hint="NOWPAYMENTS_API_KEY"
                    />
                    <Check
                      label="Webhook secret"
                      ok={Boolean(env.NOWPAYMENTS_IPN_SECRET)}
                      hint="NOWPAYMENTS_IPN_SECRET"
                    />
                    <Check
                      label="Payout login"
                      ok={Boolean(
                        env.NOWPAYMENTS_EMAIL && env.NOWPAYMENTS_PASSWORD,
                      )}
                      hint="NOWPAYMENTS_EMAIL and PASSWORD"
                    />
                    <Check
                      label="Payout 2FA"
                      ok={Boolean(env.NOWPAYMENTS_2FA_SECRET)}
                      hint="NOWPAYMENTS_2FA_SECRET"
                    />
                  </div>
                  <ToastForm action={testPaymentsAction}>
                    <SubmitButton
                      variant="outline"
                      size="default"
                      pending="Testing…"
                    >
                      Test connection
                    </SubmitButton>
                  </ToastForm>
                </div>
              </SettingsRow>
              <SettingsRow
                title="Callback address"
                description="Paste this into your payment provider's IPN settings. It needs a public https address."
              >
                <CopyField
                  label="Webhook URL"
                  value={`${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/payments`}
                  mono
                />
              </SettingsRow>
            </SettingsRows>

            <ActionForm
              action={savePaymentSettingsAction}
              resetOnSuccess={false}
              className="gap-4"
            >
              <SettingsRows>
                <SettingsRow
                  title="Automatic payouts"
                  description="Refunds to crypto and withdrawals are paid by themselves only when every check passes. Anything above these limits waits for a person."
                >
                  <div className="space-y-5">
                    <div className="grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
                      <TextField
                        name="maxUsd"
                        label="Per payout (USD)"
                        type="number"
                        min="1"
                        defaultValue={pay.maxUsd}
                        required
                      />
                      <TextField
                        name="dailyUsd"
                        label="Per user per day (USD)"
                        type="number"
                        min="1"
                        defaultValue={pay.dailyUsd}
                        required
                      />
                      <TextField
                        name="newAddressMaxUsd"
                        label="New address (USD)"
                        type="number"
                        min="1"
                        defaultValue={pay.newAddressMaxUsd}
                        required
                      />
                    </div>
                    <Toggle
                      name="autoWithdraw"
                      checked={pay.autoWithdraw}
                      label="Pay automatically"
                      hint="Turn off to send every payout to the review queue."
                    />
                  </div>
                </SettingsRow>
              </SettingsRows>
              <div className="flex justify-end">
                <SubmitButton pending="Saving…">Save payments</SubmitButton>
              </div>
            </ActionForm>
          </SettingsGroup>

          <SettingsGroup
            id="tools"
            icon={Wrench}
            title="Tools"
            description="Everything else you use to run the shop."
          >
            <SettingsRows>
              {TOOLS.map((t) => (
                <SettingsRow key={t.href} title={t.title} description={t.body}>
                  <Button asChild variant="outline" size="sm">
                    <Link href={t.href}>
                      <t.icon /> Open
                    </Link>
                  </Button>
                </SettingsRow>
              ))}
            </SettingsRows>
          </SettingsGroup>
        </div>
      </div>
    </>
  );
}
