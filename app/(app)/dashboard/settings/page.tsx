import {
  BadgeCheck,
  Bell,
  Clock,
  Fingerprint,
  KeyRound,
  Laptop,
  ShieldCheck,
  Smartphone,
  Tablet,
  User,
} from "lucide-react";
import type { Metadata } from "next";

import {
  changePasswordAction,
  revokeOthersAction,
  revokeSessionAction,
} from "@/app/actions/user";
import { ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { KycForm } from "@/components/app/kyc-form";
import { MfaPanel } from "@/components/app/mfa-panel";
import {
  SettingsNav,
  type SettingsNavItem,
} from "@/components/app/settings-nav";
import {
  SettingsGroup,
  SettingsPanel,
  SettingsRow,
  SettingsRows,
  SettingValue,
} from "@/components/app/settings-ui";
import { StatusBadge } from "@/components/app/ui";
import { UsernameForm } from "@/components/app/username-form";
import { InstallPanel } from "@/components/pwa/install";
import { PushToggle } from "@/components/pwa/push-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { currentTokenHash } from "@/lib/auth/session";
import { connectDb } from "@/lib/db";
import { parseDevice } from "@/lib/device";
import { getEnv } from "@/lib/env";
import { Kyc } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { listSessions } from "@/lib/services/auth";
import { plain } from "@/lib/services/queries";
import { cloudinaryConfigured } from "@/lib/storage/cloudinary";

export const metadata: Metadata = { title: "Settings" };

const NAV: SettingsNavItem[] = [
  { id: "profile", label: "Profile", icon: "user" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "identity", label: "Identity", icon: "identity" },
  { id: "notifications", label: "App & alerts", icon: "bell" },
  { id: "devices", label: "Devices", icon: "devices" },
];

export default async function SettingsPage() {
  const user = await requireUser();
  await connectDb();
  const [kyc, sessions, token] = await Promise.all([
    Kyc.findOne({ userId: user.id }).lean(),
    listSessions(user.id),
    currentTokenHash(),
  ]);
  const k = plain(kyc) as {
    status: string;
    reason?: string;
    idLast4?: string;
    fullName?: string;
    idType?: string;
    documents?: { kind: string }[];
  } | null;
  const verified = k?.status === "approved";
  const initials = (user.name || user.username || user.email)
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <header className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="bg-brand/10 text-brand text-lg font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {user.name ||
              (user.username ? `@${user.username}` : "Your account")}
            {verified && (
              <span className="border-success/40 text-success bg-success/10 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium">
                <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
              </span>
            )}
          </h1>
          <p className="text-muted-foreground truncate text-sm">
            {user.username ? `@${user.username} · ` : ""}
            {user.email}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav items={NAV} />

        <div className="max-w-5xl min-w-0 space-y-10">
          <SettingsGroup
            id="profile"
            icon={User}
            title="Profile"
            description="How you appear and sign in."
          >
            <SettingsRows>
              <SettingsRow
                title="Full name"
                description="Set from your ID once you are verified."
              >
                <p className="text-sm font-medium">
                  {user.name || (
                    <span className="text-muted-foreground font-normal">
                      Not set yet
                    </span>
                  )}
                </p>
              </SettingsRow>
              <SettingsRow
                title="Email"
                description="Where we send confirmations and alerts."
              >
                <p className="truncate text-sm font-medium">{user.email}</p>
              </SettingsRow>
              <SettingsRow
                title="Username"
                description="Log in with your username or email. Usernames are unique."
              >
                <div className="max-w-sm">
                  <UsernameForm current={user.username} />
                </div>
              </SettingsRow>
            </SettingsRows>
          </SettingsGroup>

          <SettingsGroup
            id="security"
            icon={ShieldCheck}
            title="Security"
            description="Protect your account and your money."
          >
            <SettingsRows>
              <SettingsRow
                id="two-step"
                title="Two-step login"
                description="An authenticator app code plus one-time recovery codes."
              >
                <MfaPanel enabled={user.mfaEnabled} />
              </SettingsRow>
              <SettingsRow
                title="Password"
                description="Changing it signs out your other devices."
              >
                <ActionForm action={changePasswordAction} className="max-w-sm">
                  <TextField
                    name="current"
                    label="Current password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                  <TextField
                    name="next"
                    label="New password"
                    type="password"
                    autoComplete="new-password"
                    required
                    hint="At least 10 characters, with a letter and a number."
                  />
                  <TextField
                    name="confirm"
                    label="Confirm new password"
                    type="password"
                    autoComplete="new-password"
                    required
                  />
                  <SubmitButton pending="Saving…">
                    <KeyRound /> Update password
                  </SubmitButton>
                </ActionForm>
              </SettingsRow>
            </SettingsRows>
          </SettingsGroup>

          <SettingsGroup
            id="identity"
            icon={Fingerprint}
            title="Identity verification"
            description="Required before your first withdrawal. Our team reviews your details and photos."
          >
            <SettingsPanel
              title="Verification status"
              action={<StatusBadge status={k?.status ?? "none"} />}
            >
              {verified ? (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                  <SettingValue label="Name on ID">
                    {k?.fullName ?? "-"}
                  </SettingValue>
                  <SettingValue label="ID type">
                    <span className="capitalize">
                      {(k?.idType ?? "").replace(/_/g, " ")}
                    </span>
                  </SettingValue>
                  <SettingValue label="ID number">
                    {k?.idLast4 ? `ending ${k.idLast4}` : "-"}
                  </SettingValue>
                </div>
              ) : k?.status === "pending" ? (
                <div className="flex items-start gap-3">
                  <Clock
                    className="text-brand mt-0.5 size-5 shrink-0"
                    aria-hidden="true"
                  />
                  <p className="text-muted-foreground text-sm">
                    We received your details
                    {k.documents?.length
                      ? ` and ${k.documents.length} photo${k.documents.length > 1 ? "s" : ""}`
                      : ""}
                    . A person is reviewing them now, usually within a day. We
                    will email you as soon as it is done.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {k?.status === "rejected" && (
                    <p className="border-destructive-foreground/40 bg-destructive-foreground/5 rounded-lg border px-4 py-3 text-sm">
                      <strong>Not approved.</strong>{" "}
                      {k.reason || "Please check your details and photos."} You
                      can submit again below.
                    </p>
                  )}
                  <KycForm
                    defaultName={user.name || undefined}
                    uploads={cloudinaryConfigured()}
                  />
                </div>
              )}
            </SettingsPanel>
          </SettingsGroup>

          <SettingsGroup
            id="notifications"
            icon={Bell}
            title="App and alerts"
            description="Get Meridian on your home screen and hear about payments straight away."
          >
            <SettingsRows>
              <SettingsRow
                title="Install the app"
                description="Faster access and a full-screen experience."
              >
                <InstallPanel />
              </SettingsRow>
              <SettingsRow
                title="Push notifications"
                description="Deposit, payout and support updates on this device, even when the app is closed."
              >
                <PushToggle publicKey={getEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
              </SettingsRow>
            </SettingsRows>
          </SettingsGroup>

          <SettingsGroup
            id="devices"
            icon={Laptop}
            title="Devices"
            description="Sign out any device you do not recognise."
          >
            <SettingsPanel title="Where you are signed in">
              <ul className="divide-y">
                {plain(sessions).map(
                  (s: {
                    _id: string;
                    userAgent?: string;
                    ip?: string;
                    lastUsedAt: string;
                    tokenHash: string;
                  }) => {
                    const current = s.tokenHash === token;
                    const device = parseDevice(s.userAgent);
                    const Icon =
                      device.kind === "phone"
                        ? Smartphone
                        : device.kind === "tablet"
                          ? Tablet
                          : Laptop;
                    return (
                      <li
                        key={s._id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-medium">
                              {device.name}
                              {current && (
                                <span className="border-success/40 text-success bg-success/10 rounded-md border px-1.5 py-0.5 text-[10px] font-medium">
                                  This device
                                </span>
                              )}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {s.ip === "::1" || s.ip === "127.0.0.1"
                                ? "Local connection"
                                : (s.ip ?? "Unknown location")}{" "}
                              · Last active {formatDateTime(s.lastUsedAt)}
                            </p>
                          </div>
                        </div>
                        {!current && (
                          <form action={revokeSessionAction}>
                            <input type="hidden" name="id" value={s._id} />
                            <Button type="submit" variant="outline" size="sm">
                              Sign out
                            </Button>
                          </form>
                        )}
                      </li>
                    );
                  },
                )}
              </ul>
              <form action={revokeOthersAction} className="mt-4">
                <Button type="submit" variant="outline" size="sm">
                  Sign out all other devices
                </Button>
              </form>
            </SettingsPanel>
          </SettingsGroup>
        </div>
      </div>
    </>
  );
}
