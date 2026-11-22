import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { orderingNotice, ShopProducts } from "@/components/shop/shop-products";
import { Section } from "@/components/ui/section";
import { getCurrentUser } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/env";
import { getStorefrontCatalogue } from "@/lib/services/catalogue";
import { orderAssets } from "@/lib/services/order-payments";
import { getShopSettings } from "@/lib/services/shop-settings";

export const dynamic = "force-dynamic";

const KNOWN = ["airtime", "data", "electricity", "tv"];
const KNOWN_NAMES: Record<string, string> = {
  airtime: "Airtime",
  data: "Data bundles",
  electricity: "Electricity",
  tv: "Cable TV",
};

type Cat = Awaited<ReturnType<typeof getStorefrontCatalogue>>[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  return {
    title: category.replace("-", " "),
    alternates: { canonical: `/${category}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!isDbConfigured() || !/^[a-z0-9-]{2,31}$/.test(category)) notFound();
  const [catalogue, settings, assets, user] = await Promise.all([
    getStorefrontCatalogue(),
    getShopSettings(),
    orderAssets(),
    getCurrentUser(),
  ]);
  const cat = (catalogue as Cat[]).find((c) => c.slug === category);
  // Gift cards are not on sale yet. Show a plain page instead of a dead link.
  if (!cat && category === "gift-cards")
    return (
      <Section aria-labelledby="shop-title">
        <div className="max-w-container mx-auto flex flex-col gap-4">
          <h1 id="shop-title" className="text-3xl font-bold tracking-tight">
            Gift cards
          </h1>
          <p className="text-muted-foreground max-w-prose text-sm">
            Gift cards are coming soon. Airtime, data, electricity and cable TV
            are what we sell today.
          </p>
        </div>
      </Section>
    );
  if (!cat && KNOWN.includes(category))
    return (
      <Section aria-labelledby="shop-title">
        <div className="max-w-container mx-auto flex flex-col gap-4">
          <h1 id="shop-title" className="text-3xl font-bold tracking-tight">
            {KNOWN_NAMES[category]}
          </h1>
          <p className="text-muted-foreground max-w-prose text-sm">
            Nothing is on sale here yet. Please check back soon.
          </p>
        </div>
      </Section>
    );
  if (!cat) notFound();

  return (
    <Section aria-labelledby="shop-title">
      <div className="max-w-container mx-auto flex flex-col gap-8">
        <div className="space-y-2">
          <h1 id="shop-title" className="text-3xl font-bold tracking-tight">
            {cat.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            Prices are shown in naira and US dollars and include everything. You
            pay in crypto, and the amount is quoted when you start. Crypto
            payments are final once confirmed.
          </p>
          {orderingNotice(settings) && (
            <p
              role="status"
              className="border-gold/50 bg-gold/10 rounded-lg border px-3 py-2 text-sm"
            >
              {orderingNotice(settings)}
            </p>
          )}
        </div>
        <ShopProducts
          cat={cat}
          assets={assets}
          signedIn={Boolean(user)}
          ordersOpen={settings.ordersOpen && !settings.maintenance}
          windowMin={settings.paymentWindowMin}
        />
      </div>
    </Section>
  );
}
