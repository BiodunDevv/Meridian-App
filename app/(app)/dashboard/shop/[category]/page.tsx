import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import { orderingNotice, ShopProducts } from "@/components/shop/shop-products";
import { requireUser } from "@/lib/auth/guards";
import { getStorefrontCatalogue } from "@/lib/services/catalogue";
import { orderAssets } from "@/lib/services/order-payments";
import { getShopSettings } from "@/lib/services/shop-settings";

export const metadata: Metadata = { title: "Shop" };
export const dynamic = "force-dynamic";

const KNOWN: Record<string, string> = {
  airtime: "Airtime",
  data: "Data bundles",
  electricity: "Electricity",
  tv: "Cable TV",
};

export default async function ShopCategory({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  await requireUser();
  const { category } = await params;
  const [catalogue, settings, assets] = await Promise.all([
    getStorefrontCatalogue(),
    getShopSettings(),
    orderAssets(),
  ]);
  const cat = catalogue.find((c: { slug: string }) => c.slug === category);
  if (!cat && !KNOWN[category]) notFound();
  const notice = orderingNotice(settings);

  return (
    <>
      <Link
        href="/dashboard/shop"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> All categories
      </Link>
      <PageHeader
        title={cat?.name ?? KNOWN[category]}
        description="Prices are shown in naira and US dollars and include everything. You pay in crypto, and the amount is quoted when you start. Crypto payments are final once confirmed."
      />
      {notice && (
        <p
          role="status"
          className="border-gold/50 bg-gold/10 rounded-xl border px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}
      {cat ? (
        <ShopProducts
          cat={cat}
          assets={assets}
          signedIn
          ordersOpen={settings.ordersOpen && !settings.maintenance}
          windowMin={settings.paymentWindowMin}
        />
      ) : (
        <Panel>
          <EmptyState
            title="Nothing is on sale here yet"
            body="Please check back soon."
          />
        </Panel>
      )}
    </>
  );
}
