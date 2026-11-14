import type { Metadata } from "next";
import Link from "next/link";

import { registerAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton, TextField } from "@/components/app/form";
import { AuthLayout, authLink } from "@/components/auth/auth-layout";
import { redirectIfSignedIn } from "@/lib/auth/guards";
import { isDbConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  if (isDbConfigured()) await redirectIfSignedIn();
  return (
    <AuthLayout
      risk
      title="Create account"
      subtitle="Join Meridian in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={sp.plan ? `/login?plan=${sp.plan}` : "/login"}
            className={authLink}
          >
            Log in
          </Link>
        </>
      }
    >
      <ActionForm action={registerAction} resetOnSuccess={false}>
        <input type="hidden" name="plan" value={sp.plan ?? ""} />
        <input type="hidden" name="ref" value={sp.ref ?? ""} />
        <input type="hidden" name="name" value="" />
        <TextField
          name="email"
          label="Email"
          type="email"
          placeholder="your.email@example.com"
          autoComplete="email"
          required
          defaultValue={sp.email}
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          placeholder="10+ characters, with a number"
          autoComplete="new-password"
          required
        />
        <SubmitButton pending="Creating account…">Create account</SubmitButton>
      </ActionForm>
    </AuthLayout>
  );
}
