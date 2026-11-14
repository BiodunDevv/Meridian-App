import { BadgePercent, Mail, ScrollText, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  saveActivityTickerAction,
  savePaymentSettingsAction,
  saveReferralSettingsAction,
  testPaymentsAction,
} from "@/app/actions/admin";
import { CopyField } from "@/components/app/copy-field";
import { ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { ToastForm } from "@/components/app/toast-form";
import { PageHeader, Panel } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { getEnv } from "@/lib/env";
import {
  paymentsConfigured,
  payoutsConfigured,
} from "@/lib/payments/nowpayments";
import { isTickerEnabled } from "@/lib/services/activity";
import { getPaymentSettings } from "@/lib/services/payments";
import { getReferralSettings } from "@/lib/services/referrals";

export const metadata: Metadata = { title: "Settings" };

const links = [
  {
    href: "/admin/payment-methods",
    icon: Wallet,
    title: "Payment methods",
    body: "Assets, networks and wallet addresses.",
  },
  {
    href: "/admin/plans",
    icon: BadgePercent,
    title: "Plans",
    body: "Terms, status and order of investment plans.",
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

export default async function AdminSettings() {
  const [ref, ticker, pay] = await Promise.all([
    getReferralSettings(),
    isTickerEnabled(),
    getPaymentSettings(),
  ]);
  const env = getEnv();
  const checks: [string, boolean, string][] = [
    ["API key", Boolean(env.NOWPAYMENTS_API_KEY), "NOWPAYMENTS_API_KEY"],
    [
      "Webhook secret",
      Boolean(env.NOWPAYMENTS_IPN_SECRET),
      "NOWPAYMENTS_IPN_SECRET",
    ],
    [
      "Payout login",
      Boolean(env.NOWPAYMENTS_EMAIL && env.NOWPAYMENTS_PASSWORD),
      "NOWPAYMENTS_EMAIL and NOWPAYMENTS_PASSWORD",
    ],
    [
      "Payout 2FA",
      Boolean(env.NOWPAYMENTS_2FA_SECRET),
      "NOWPAYMENTS_2FA_SECRET",
    ],
  ];
  return (
    <>
      <PageHeader title="Settings" description="Platform configuration." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Panel key={l.href} title={l.title} description={l.body}>
            <Button asChild variant="outline" size="sm" className="self-start">
              <Link href={l.href}>
                <l.icon /> Open
              </Link>
            </Button>
          </Panel>
        ))}
      </div>

      <Panel
        title="Online payments"
        description="Deposits are detected and credited automatically, and withdrawals are paid automatically when they pass the safety checks. Anything else waits for a person."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {checks.map(([label, ok, envName]) => (
            <div
              key={label}
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${ok ? "bg-success" : "bg-muted-foreground/40"}`}
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground block text-xs">
                  {ok ? "Connected" : `Set ${envName}`}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Mode:{" "}
          {paymentsConfigured()
            ? env.NOWPAYMENTS_SANDBOX === "true"
              ? "sandbox (test money only)"
              : "live"
            : "manual review"}
          .
          {payoutsConfigured()
            ? " Automatic payouts are available."
            : " Without a payout login, withdrawals stay manual."}
        </p>
        <CopyField
          label="Webhook URL (paste into your provider's IPN settings)"
          value={`${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/payments`}
          mono
        />
        <ToastForm action={testPaymentsAction}>
          <SubmitButton variant="outline" size="default" pending="Testing…">
            Test connection
          </SubmitButton>
        </ToastForm>
        <ActionForm
          action={savePaymentSettingsAction}
          className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3"
          resetOnSuccess={false}
        >
          <TextField
            name="maxUsd"
            label="Per withdrawal limit (USD)"
            type="number"
            min="1"
            defaultValue={pay.maxUsd}
            required
            hint="Above this, a person checks it."
          />
          <TextField
            name="dailyUsd"
            label="Daily limit per user (USD)"
            type="number"
            min="1"
            defaultValue={pay.dailyUsd}
            required
          />
          <TextField
            name="newAddressMaxUsd"
            label="New address limit (USD)"
            type="number"
            min="1"
            defaultValue={pay.newAddressMaxUsd}
            required
            hint="First payout to an address."
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="autoWithdraw"
              defaultChecked={pay.autoWithdraw}
              className="size-4"
            />{" "}
            Pay withdrawals automatically
          </label>
          <div className="sm:justify-self-end">
            <SubmitButton pending="Saving…">Save</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel
        title="Referral programme"
        description="Users earn a reward when someone they invited makes their first qualifying deposit. Rewards are credited once per referred user."
      >
        <ActionForm
          action={saveReferralSettingsAction}
          className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3"
          resetOnSuccess={false}
        >
          <TextField
            name="pct"
            label="Reward (%)"
            type="number"
            step="0.1"
            min="0"
            defaultValue={ref.pct}
            required
            hint="Of the first deposit."
          />
          <TextField
            name="capUsd"
            label="Cap per referral (USD)"
            type="number"
            min="1"
            defaultValue={ref.capUsd}
            required
          />
          <TextField
            name="minDepositUsd"
            label="Minimum deposit (USD)"
            type="number"
            min="1"
            defaultValue={ref.minDepositUsd}
            required
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={ref.enabled}
              className="size-4"
            />{" "}
            Programme is on
          </label>
          <div className="sm:justify-self-end">
            <SubmitButton pending="Saving…">Save</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel
        title="Recent activity ticker"
        description="A slim strip across the top of the investor app showing real recent activity (paid withdrawals, profit credited and confirmed deposits) with masked usernames such as j***n. It only shows real events from the last two weeks, and stays hidden when there are fewer than three."
      >
        <ActionForm
          action={saveActivityTickerAction}
          className="max-w-md"
          resetOnSuccess={false}
        >
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={ticker}
              className="size-4"
            />{" "}
            Show the ticker to investors
          </label>
          <SubmitButton pending="Saving…" className="self-start">
            Save
          </SubmitButton>
        </ActionForm>
      </Panel>
    </>
  );
}
