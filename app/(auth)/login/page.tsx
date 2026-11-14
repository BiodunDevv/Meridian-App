import type { Metadata } from "next";
import Link from "next/link";

import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { AuthLayout, authLink } from "@/components/auth/auth-layout";
import { redirectIfSignedIn } from "@/lib/auth/guards";
import { isDbConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (isDbConfigured()) await redirectIfSignedIn();
  const notice = sp.verified
    ? "Email confirmed. You can log in now."
    : sp.reset
      ? "Password updated. Log in with your new password."
      : sp.error === "suspended"
        ? "This account is suspended. Contact support."
        : null;
  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back to Meridian."
      footer={
        <>
          New to Meridian?{" "}
          <Link
            href={sp.plan ? `/register?plan=${sp.plan}` : "/register"}
            className={authLink}
          >
            Create account
          </Link>
        </>
      }
    >
      {notice && (
        <p
          role="status"
          className="bg-brand/10 text-foreground rounded-md border px-3 py-2 text-sm"
        >
          {notice}
        </p>
      )}
      <ActionForm action={loginAction} resetOnSuccess={false}>
        <input type="hidden" name="plan" value={sp.plan ?? ""} />
        <TextField
          name="identifier"
          label="Email or username"
          autoComplete="username"
          autoCapitalize="none"
          required
          defaultValue={sp.email}
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
        />
        <div className="-mt-2 text-right text-sm">
          <Link href="/forgot-password" className={authLink}>
            Forgot password?
          </Link>
        </div>
        <SubmitButton pending="Logging in…">Log in</SubmitButton>
      </ActionForm>
    </AuthLayout>
  );
}
