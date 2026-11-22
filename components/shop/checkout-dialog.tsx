"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  createOrderAction,
  quoteOrderAction,
  type QuoteView,
} from "@/app/actions/orders";
import {
  ActionForm,
  Field,
  SubmitButton,
  TextField,
} from "@/components/app/form";
import { IconSelect } from "@/components/app/icon-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMinor } from "@/lib/money";

export interface ShopProduct {
  id: string;
  name: string;
  kind: "fixed" | "open";
  currency: "NGN" | "USD";
  minMinor: number;
  maxMinor: number;
  notes?: string;
  inputs: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    options?: string[];
  }[];
  options: { label: string; valueMinor: number; priceMinor: number }[];
}
export interface ShopAsset {
  symbol: string;
  name: string;
  networks: { name: string }[];
}

const INPUT_TYPE: Record<string, string> = {
  phone: "tel",
  email: "email",
  number: "text",
};

/**
 * Checkout for one item: choose, enter details, see the exact price, pick a coin, create the order.
 * Everything shown is an estimate until the server creates the order; the server recomputes every number.
 */
export function CheckoutDialog({
  product,
  assets,
  signedIn,
  ordersOpen,
  windowMin,
  trigger,
}: {
  product: ShopProduct;
  assets: ShopAsset[];
  signedIn: boolean;
  ordersOpen: boolean;
  windowMin: number;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [option, setOption] = useState(product.options[0]?.label ?? "");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(assets[0]?.symbol ?? "");
  const [network, setNetwork] = useState(assets[0]?.networks[0]?.name ?? "");
  const [agree, setAgree] = useState(false);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState(false);

  const networks = useMemo(
    () => assets.find((a) => a.symbol === asset)?.networks ?? [],
    [assets, asset],
  );

  // Ask the server for the price whenever the choice changes (a short delay while typing an amount).
  useEffect(() => {
    if (!open) return;
    const ready =
      product.kind === "fixed" ? Boolean(option) : Number(amount) > 0;
    if (!ready) return;
    let live = true;
    const t = setTimeout(
      async () => {
        setBusy(true);
        const r = await quoteOrderAction({
          productId: product.id,
          option,
          amount,
        });
        if (live) {
          setQuote(r);
          setBusy(false);
        }
      },
      product.kind === "open" ? 350 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, option, amount, product.id, product.kind]);

  const other = quote?.currency === "NGN" ? "USD" : "NGN";
  const canPay = signedIn && ordersOpen && assets.length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            Pay with crypto. The price and crypto amount are held for{" "}
            {windowMin} minutes after you start.
          </DialogDescription>
        </DialogHeader>

        {!signedIn ? (
          <div className="space-y-3 text-sm">
            <p>Log in or create an account to place an order.</p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className="bg-brand text-primary-foreground inline-flex h-10 items-center rounded-md px-4 font-medium"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="inline-flex h-10 items-center rounded-md border px-4 font-medium"
              >
                Create account
              </Link>
            </div>
          </div>
        ) : !ordersOpen ? (
          <p className="text-sm">
            Ordering is not open yet. Please check back soon.
          </p>
        ) : assets.length === 0 ? (
          <p className="text-sm">
            Crypto payments are not available right now. Please try again later.
          </p>
        ) : (
          <ActionForm
            action={createOrderAction}
            resetOnSuccess={false}
            onSuccess={(s) => {
              setOpen(false);
              if (s.id) router.push(`/dashboard/orders/${s.id}`);
            }}
          >
            <input type="hidden" name="productId" value={product.id} />
            {product.kind === "fixed" ? (
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">
                  Choose an option
                </legend>
                <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                  {product.options.map((o) => (
                    <label
                      key={o.label}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border p-3 text-sm ${option === o.label ? "border-brand bg-brand/5" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="option"
                          value={o.label}
                          checked={option === o.label}
                          onChange={() => setOption(o.label)}
                        />
                        {o.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <TextField
                name="amount"
                label={`Amount (${product.currency})`}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                hint={`Between ${formatMinor(product.minMinor, product.currency)} and ${formatMinor(product.maxMinor, product.currency)}.`}
                required
                autoComplete="off"
              />
            )}

            {product.inputs.map((d) =>
              d.type === "select" ? (
                <Field key={d.key} label={d.label} htmlFor={`in_${d.key}`}>
                  <IconSelect
                    name={`in_${d.key}`}
                    id={`in_${d.key}`}
                    required={d.required}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose…
                    </option>
                    {(d.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </IconSelect>
                </Field>
              ) : (
                <TextField
                  key={d.key}
                  name={`in_${d.key}`}
                  label={d.label}
                  type={INPUT_TYPE[d.type] ?? "text"}
                  inputMode={d.type === "email" ? "email" : "numeric"}
                  required={d.required}
                  autoComplete="off"
                />
              ),
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Pay with" htmlFor="asset">
                <IconSelect
                  name="asset"
                  id="asset"
                  value={asset}
                  onChange={(e) => {
                    setAsset(e.target.value);
                    setNetwork(
                      assets.find((a) => a.symbol === e.target.value)
                        ?.networks[0]?.name ?? "",
                    );
                  }}
                >
                  {assets.map((a) => (
                    <option key={a.symbol} value={a.symbol}>
                      {a.symbol} · {a.name}
                    </option>
                  ))}
                </IconSelect>
              </Field>
              <Field label="Network" htmlFor="network">
                <IconSelect
                  name="network"
                  id="network"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                >
                  {networks.map((n) => (
                    <option key={n.name} value={n.name}>
                      {n.name}
                    </option>
                  ))}
                </IconSelect>
              </Field>
            </div>

            <div
              className="bg-muted/50 space-y-1 rounded-lg border p-3 text-sm"
              aria-live="polite"
            >
              {quote?.ok ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-lg font-semibold tabular-nums">
                      {formatMinor(quote.priceMinor!, quote.currency!)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {quote.otherMinor
                      ? `About ${formatMinor(quote.otherMinor, other)}. `
                      : ""}
                    No other fees at checkout. The crypto amount is shown on the
                    next screen.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  {busy
                    ? "Calculating the price…"
                    : (quote?.error ?? "Choose an option to see the price.")}
                </p>
              )}
            </div>

            <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
              <li>Crypto payments are final once confirmed on the network.</li>
              <li>
                If we cannot deliver, you get a refund as store credit.{" "}
                <Link href="/refunds" className="underline">
                  Refund policy
                </Link>
              </li>
              <li>
                Delivery time depends on the item and provider. We do not
                promise a time.{product.notes ? ` ${product.notes}` : ""}
              </li>
            </ul>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-1 size-4"
              />
              I understand and agree to the{" "}
              <Link href="/terms" className="underline">
                terms
              </Link>
              .
            </label>
            <SubmitButton
              pending="Creating order…"
              disabled={!agree || !quote?.ok || !canPay}
            >
              Continue to payment
            </SubmitButton>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
