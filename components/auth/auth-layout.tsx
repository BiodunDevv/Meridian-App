import Link from "next/link";

import { DecorIcon } from "@/components/decor-icon";
import Meridian from "@/components/logos/meridian";
import Glow from "@/components/ui/glow";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { brand } from "@/content/site";

export const authLink =
  "text-foreground underline underline-offset-4 hover:text-primary";

/** Short legal line shown under every auth form. */
export function AuthTerms({ risk = false }: { risk?: boolean }) {
  return (
    <p className="text-muted-foreground text-xs leading-relaxed">
      By continuing, you agree to our{" "}
      <Link href="/terms" className={authLink}>
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className={authLink}>
        Privacy Policy
      </Link>
      {risk && (
        <>
          , and acknowledge the{" "}
          <Link href="/risk" className={authLink}>
            Risk Disclosure
          </Link>
        </>
      )}
      .
    </p>
  );
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  risk,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  risk?: boolean;
}) {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden px-6 py-16 md:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Glow
          variant="bottom"
          className="animate-appear-zoom opacity-0 delay-300"
        />
      </div>
      <Link
        href="/"
        aria-label={brand.name}
        className="absolute top-4 left-4 flex items-center text-xl"
      >
        <Meridian />
      </Link>
      <div className="absolute top-3 right-3">
        <ModeToggle />
      </div>

      <div className="dark:bg-[radial-gradient(50%_80%_at_20%_0%,--theme(--color-brand/.16),transparent)] relative w-full max-w-sm p-6 md:p-8">
        <div className="bg-border dark:bg-border/20 absolute -inset-y-6 -left-px w-px" />
        <div className="bg-border dark:bg-border/20 absolute -inset-y-6 -right-px w-px" />
        <div className="bg-border dark:bg-border/20 absolute -inset-x-6 -top-px h-px" />
        <div className="bg-border dark:bg-border/20 absolute -inset-x-6 -bottom-px h-px" />
        <DecorIcon position="top-left" />
        <DecorIcon position="bottom-right" />

        <div className="animate-in fade-in space-y-5 duration-500">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-muted-foreground text-sm">{subtitle}</p>
            )}
          </div>
          {children}
          {footer && (
            <div className="text-muted-foreground text-sm">{footer}</div>
          )}
          <AuthTerms risk={risk} />
        </div>
      </div>
    </div>
  );
}
