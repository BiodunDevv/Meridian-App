import { Gift, Package, Smartphone, Tv, Wifi, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import { orderingNotice } from "@/components/shop/shop-products";
import { requireUser } from "@/lib/auth/guards";
import { getStorefrontCatalogue } from "@/lib/services/catalogue";
import { getShopSettings } from "@/lib/services/shop-settings";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

const ICONS = { Smartphone, Wifi, Zap, Tv, Gift } as const;
const BLURB: Record<string, string> = {
  airtime: "Top up any supported phone number.",
  data: "Data bundles for any supported number.",
  electricity: "Prepaid and postpaid meters. The token shows on your order.",
  tv: "Renew a subscription with your smartcard number.",
};

export default async function ShopPage() {
  await requireUser();
  const [catalogue, settings] = await Promise.all([
    getStorefrontCatalogue(),
    getShopSettings(),
  ]);
  const notice = orderingNotice(settings);
  return (
    <>
      <PageHeader
        title="Shop"
        description="Choose what you need, then pay with crypto. Each order gets its own payment and its own status."
      />
      {notice && (
        <p
          role="status"
          className="border-gold/50 bg-gold/10 rounded-xl border px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}
      {catalogue.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Package}
            title="Nothing is on sale yet"
            body="Products appear here as soon as they are added and switched on. Please check back soon."
          />
        </Panel>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalogue.map(
            (c: {
              slug: string;
              name: string;
              icon: string;
              products: unknown[];
            }) => {
              const Icon = ICONS[c.icon as keyof typeof ICONS] ?? Package;
              return (
                <li key={c.slug}>
                  <Link
                    href={`/dashboard/shop/${c.slug}`}
                    className="bg-card hover:border-brand/50 flex h-full flex-col gap-3 rounded-xl border p-5 shadow-sm transition-colors"
                  >
                    <span className="bg-brand/10 text-brand flex size-10 items-center justify-center rounded-lg">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="text-muted-foreground text-sm">
                      {BLURB[c.slug] ?? "Choose a product and pay with crypto."}
                    </span>
                    <span className="text-muted-foreground mt-auto text-xs">
                      {c.products.length} product
                      {c.products.length === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              );
            },
          )}
          <li className="bg-muted/40 flex h-full flex-col gap-3 rounded-xl border border-dashed p-5">
            <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
              <Gift className="size-5" aria-hidden="true" />
            </span>
            <span className="font-semibold">Gift cards</span>
            <span className="text-muted-foreground text-sm">Coming soon.</span>
          </li>
        </ul>
      )}
    </>
  );
}
