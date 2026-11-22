import { Gift, Smartphone, Tv, Wifi, Zap } from "lucide-react";
import Link from "next/link";

const ITEMS = [
  {
    slug: "airtime",
    title: "Airtime",
    body: "Top up any supported phone number.",
    icon: Smartphone,
  },
  {
    slug: "data",
    title: "Data bundles",
    body: "Data for any supported number.",
    icon: Wifi,
  },
  {
    slug: "electricity",
    title: "Electricity",
    body: "Prepaid and postpaid meters.",
    icon: Zap,
  },
  {
    slug: "tv",
    title: "Cable TV",
    body: "Renew with your smartcard number.",
    icon: Tv,
  },
] as const;

/**
 * Everything a customer can pay for, as one tap each. It is a fixed list, so it shows even before the catalogue is
 * filled; each tile opens that category inside the dashboard.
 */
export function PayForTiles() {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {ITEMS.map(({ slug, title, body, icon: Icon }) => (
        <li key={slug}>
          <Link
            href={`/dashboard/shop/${slug}`}
            className="bg-card hover:border-brand/50 flex h-full flex-col gap-2 rounded-xl border p-4 shadow-sm transition-colors"
          >
            <span className="bg-brand/10 text-brand flex size-9 items-center justify-center rounded-lg">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold">{title}</span>
            <span className="text-muted-foreground text-xs">{body}</span>
          </Link>
        </li>
      ))}
      <li>
        <div className="bg-muted/40 flex h-full flex-col gap-2 rounded-xl border border-dashed p-4">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
            <Gift className="size-[18px]" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold">Gift cards</span>
          <span className="text-muted-foreground text-xs">Coming soon.</span>
        </div>
      </li>
    </ul>
  );
}
