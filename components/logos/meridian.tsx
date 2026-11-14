import * as React from "react";

export default function Apexvest(props: React.SVGProps<SVGSVGElement>) {
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
      <path d="M5 24 14 8l9 16H5Z" fill="#fff" />
      <path d="m16.5 24 5-8.5 5.5 8.5h-10.5Z" fill="#d4af37" />
    </svg>
  );
}
