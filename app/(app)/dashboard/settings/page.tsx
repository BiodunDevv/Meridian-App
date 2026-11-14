import type { Metadata } from "next";

import {
  changePasswordAction,
  kycAction,
  revokeOthersAction,
  revokeSessionAction,
} from "@/app/actions/user";
import {
  ActionForm,
  Field,
  NativeSelect,
  SubmitButton,
  TextField,
} from "@/components/app/form";
import { MfaPanel } from "@/components/app/mfa-panel";
import { PageHeader, Panel, StatusBadge } from "@/components/app/ui";
import { UsernameForm } from "@/components/app/username-form";
import { InstallPanel } from "@/components/pwa/install";
import { PushToggle } from "@/components/pwa/push-toggle";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { currentTokenHash } from "@/lib/auth/session";
import { connectDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { Kyc } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { listSessions } from "@/lib/services/auth";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Settings" };

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
  } | null;
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, security and identity verification."
      />
      <Panel title="Profile">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {user.name || "Not set"}
              {k?.status === "approved" ? (
                <span className="border-success/40 text-success bg-success/10 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
                  Verified
                </span>
              ) : (
                !user.name && (
                  <span className="text-muted-foreground text-xs">
                    Set automatically when your identity is verified.
                  </span>
                )
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{user.email}</dd>
          </div>
        </dl>
      </Panel>

      <Panel
        title="Username"
        description="Use your username or your email to log in. Usernames are unique."
      >
        <div className="max-w-sm">
          <UsernameForm current={user.username} />
        </div>
      </Panel>

      <Panel
        title="Identity verification (KYC)"
        description="Required before your first withdrawal. Our team reviews your details."
      >
        <div className="flex items-center gap-2 text-sm">
          Status: <StatusBadge status={k?.status ?? "none"} />
          {k?.idLast4 && (
            <span className="text-muted-foreground">ID ending {k.idLast4}</span>
          )}
        </div>
        {k?.status === "rejected" && k.reason && (
          <p className="text-destructive-foreground text-sm">
            Reason: {k.reason}
          </p>
        )}
        {k?.status !== "approved" && k?.status !== "pending" && (
          <ActionForm
            action={kycAction}
            className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <TextField
              name="fullName"
              label="Full legal name"
              required
              autoComplete="name"
            />
            <TextField
              name="dateOfBirth"
              label="Date of birth"
              type="date"
              required
            />
            <TextField
              name="country"
              label="Country"
              required
              autoComplete="country-name"
            />
            <TextField
              name="address"
              iconKey="home"
              label="Residential address"
              required
              autoComplete="street-address"
            />
            <Field label="ID type" htmlFor="idType">
              <NativeSelect id="idType" name="idType" required>
                <option value="passport">Passport</option>
                <option value="national_id">National ID</option>
                <option value="drivers_license">Driver&apos;s license</option>
              </NativeSelect>
            </Field>
            <TextField
              name="idNumber"
              label="ID number"
              required
              autoComplete="off"
              hint="Stored encrypted."
            />
            <div className="sm:col-span-2">
              <SubmitButton pending="Submitting…">
                Submit for review
              </SubmitButton>
            </div>
          </ActionForm>
        )}
      </Panel>

      <Panel
        title="Install the app"
        description="Add Meridian to your device for faster access and a full-screen experience."
      >
        <InstallPanel />
      </Panel>

      <Panel
        title="Push notifications"
        description="Get deposit, payout and support updates on this device, even when the app is closed."
      >
        <PushToggle publicKey={getEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
      </Panel>

      <div id="two-step" className="scroll-mt-20" />
      <Panel
        title="Two-step login"
        description="Authenticator app plus one-time recovery codes."
      >
        <MfaPanel enabled={user.mfaEnabled} />
      </Panel>

      <Panel title="Password">
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
          <SubmitButton pending="Saving…">Update password</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel
        title="Where you are signed in"
        description="Sign out any device you do not recognise."
      >
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
              return (
                <li
                  key={s._id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="max-w-md truncate font-medium">
                      {s.userAgent || "Unknown device"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {s.ip ?? "Unknown IP"} · Last active{" "}
                      {formatDateTime(s.lastUsedAt)}{" "}
                      {current && "· This device"}
                    </p>
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
        <form action={revokeOthersAction}>
          <Button type="submit" variant="outline" size="sm">
            Sign out all other devices
          </Button>
        </form>
      </Panel>
    </>
  );
}
