import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The Meridian wordmark: a bold geometric M, "eridian" in Inter Medium, and one underline that runs
 * the full width beneath the whole word (the style of the reference logo). It follows the surrounding
 * text colour and size, so set the size with a font-size class, e.g. `text-xl`.
 */
export default function Meridian({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="img"
      aria-label="Meridian"
      className={cn(
        "inline-flex flex-col items-stretch leading-none font-medium tracking-tight",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-baseline gap-[0.06em]"
      >
        <svg
          viewBox="0 0 22 21.6"
          className="block h-[0.9em] w-auto shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.085"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1.8 19.9V1.8l9.2 9.4 9.2-9.4v18.1" />
        </svg>
        <span>eridian</span>
      </span>
      <span
        aria-hidden="true"
        className="mt-[0.1em] block h-[0.14em] w-full rounded-full bg-current"
      />
    </span>
  );
}

/** The square app mark (favicon, home-screen icon): a white M over a gold underline on brand blue. */
export function MeridianMark(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={28}
      height={28}
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect width="32" height="32" rx="8" fill="var(--brand-mark, #2459f2)" />
      <path
        d="M8.5 21.5V9.5l7.5 7.5 7.5-7.5v12"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 26h18"
        stroke="#d4af37"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
