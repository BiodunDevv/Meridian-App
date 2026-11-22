"use client";

import { LayoutDashboard } from "lucide-react";
import Link from "next/link";

import { appLinks, hero } from "@/content/site";
import { useMe } from "@/lib/use-me";

import { Button } from "../../ui/button";
import HeroForm from "./hero-form";

/** Under the headline. Signed out: enter an email to start sign-up. Signed in: go to the dashboard. */
export default function HeroActions() {
  const { signedIn, me, dashboardHref } = useMe();

  if (signedIn) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={dashboardHref}>
              <LayoutDashboard /> Go to your dashboard
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {me
            ? `Welcome back${me.username ? `, @${me.username}` : ""}.`
            : "Welcome back."}
        </p>
        <p className="text-muted-foreground text-xs">{hero.microcopy}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeroForm />
      <p className="text-muted-foreground text-sm">{hero.microcopy}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">{hero.loginPrompt} </span>
        <a
          href={appLinks.login}
          className="text-brand font-medium underline-offset-4 hover:underline"
        >
          {hero.loginLink}
        </a>
      </p>
    </div>
  );
}
