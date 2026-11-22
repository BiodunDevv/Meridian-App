import {
  CheckoutDialog,
  type ShopAsset,
} from "@/components/shop/checkout-dialog";
import { Button } from "@/components/ui/button";
import { formatMinor } from "@/lib/money";
import type { getStorefrontCatalogue } from "@/lib/services/catalogue";

type Cat = Awaited<ReturnType<typeof getStorefrontCatalogue>>[number];

/** Why ordering is unavailable right now, in plain words. Null when it is open. */
export function orderingNotice(s: {
  ordersOpen: boolean;
  maintenance: boolean;
}) {
  if (s.maintenance)
    return "Ordering is paused for a short time while we do some work. You can still look around.";
  if (!s.ordersOpen)
    return "Ordering is not open yet. You can look at what we sell.";
  return null;
}

/**
 * The product cards for one category, each with its checkout. Shared by the public shop pages and the
 * customer dashboard, so both show exactly the same prices and the same checkout.
 */
export function ShopProducts({
  cat,
  assets,
  signedIn,
  ordersOpen,
  windowMin,
}: {
  cat: Cat;
  assets: ShopAsset[];
  signedIn: boolean;
  ordersOpen: boolean;
  windowMin: number;
}) {
  if (cat.products.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Nothing is available in this category right now.
      </p>
    );
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cat.products.map((p: Cat["products"][number]) => {
        const prices = p.options.map(
          (o: { priceMinor: number }) => o.priceMinor,
        );
        const from = prices.length
          ? `From ${formatMinor(Math.min(...prices), p.currency)}`
          : p.kind === "open"
            ? "Choose your amount"
            : "";
        return (
          <li
            key={p.id}
            className="bg-card flex flex-col justify-between gap-4 rounded-xl border p-5 shadow-sm"
          >
            <div className="space-y-1">
              <h2 className="font-semibold">{p.name}</h2>
              <p className="text-muted-foreground text-sm">{from}</p>
            </div>
            <CheckoutDialog
              product={p}
              assets={assets}
              signedIn={signedIn}
              ordersOpen={ordersOpen}
              windowMin={windowMin}
              trigger={<Button>Buy</Button>}
            />
          </li>
        );
      })}
    </ul>
  );
}
