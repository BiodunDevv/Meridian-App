import {
  AlertTriangle,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  addPopularAssetsAction,
  deleteAssetAction,
  deleteNetworkAction,
  toggleAssetAction,
  toggleNetworkAction,
} from "@/app/actions/admin";
import { CoinLogo, NetworkLogo } from "@/components/app/coin-logo";
import { CopyButton } from "@/components/app/copy-button";
import { IconSubmit, SubmitButton } from "@/components/app/form";
import {
  AddAssetDialog,
  NetworkDialog,
  RenameAssetDialog,
} from "@/components/app/payment-methods";
import { ConfirmAction, ToastForm } from "@/components/app/toast-form";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { ASSET_SUGGESTIONS } from "@/lib/coins";
import { connectDb } from "@/lib/db";
import { Asset } from "@/lib/models";
import { paymentsConfigured, providerCode } from "@/lib/payments/nowpayments";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Payment methods" };

type A = {
  symbol: string;
  name: string;
  active: boolean;
  networks: {
    name: string;
    address: string;
    memo?: string;
    providerCode?: string;
    active: boolean;
  }[];
};

export default async function PaymentMethods({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  await connectDb();
  const all = plain(
    await Asset.find().sort({ sort: 1, symbol: 1 }).lean(),
  ) as A[];
  const online = paymentsConfigured();
  // A network works when it has an address, or when the payment provider can create addresses for it.
  const works = (a: A, n: A["networks"][number]) =>
    n.active &&
    (Boolean(n.address) ||
      (online && Boolean(providerCode(a.symbol, n.name, n.providerCode))));
  const needsAddress = (a: A) =>
    a.networks.length === 0 || a.networks.some((n) => n.active && !works(a, n));
  const isLive = (a: A) => a.active && a.networks.some((n) => works(a, n));
  const live = all.filter(isLive).length;
  const attention = all.filter((a) => a.active && needsAddress(a)).length;
  const hidden = all.filter((a) => !a.active).length;
  const networkCount = all.reduce((n, a) => n + a.networks.length, 0);
  const q = (sp.q ?? "").trim().toLowerCase();
  const view = sp.view ?? "all";
  const assets = all.filter((a) => {
    if (q && !`${a.symbol} ${a.name}`.toLowerCase().includes(q)) return false;
    if (view === "live") return isLive(a);
    if (view === "attention") return a.active && needsAddress(a);
    if (view === "hidden") return !a.active;
    return true;
  });
  const tabs = [
    ["all", "All", all.length],
    ["live", "Live", live],
    ["attention", "Needs attention", attention],
    ["hidden", "Hidden", hidden],
  ] as const;

  return (
    <>
      <PageHeader
        title="Payment methods"
        description="The assets and networks users can deposit and withdraw with. Add any network you support and keep addresses up to date."
        action={
          <div className="flex flex-wrap gap-2">
            <ToastForm action={addPopularAssetsAction}>
              <SubmitButton variant="outline" size="default" pending="Adding…">
                <Sparkles /> Add popular set
              </SubmitButton>
            </ToastForm>
            <AddAssetDialog
              trigger={
                <Button>
                  <Plus /> Add payment method
                </Button>
              }
            />
          </div>
        }
      />

      {all.length > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            label="Live for users"
            value={`${live} of ${all.length}`}
            icon={Wallet}
            tone="positive"
          />
          <StatCard
            label="Networks"
            value={String(networkCount)}
            icon={Wallet}
          />
          <StatCard
            label="Need an address"
            value={String(attention)}
            icon={AlertTriangle}
            tone={attention ? "gold" : undefined}
            hint={attention ? "Users cannot use these yet" : "All set"}
          />
          <StatCard label="Hidden" value={String(hidden)} icon={EyeOff} />
        </div>
      )}

      {all.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bg-muted/50 inline-flex flex-wrap gap-1 rounded-lg border p-1">
            {tabs.map(([v, label, n]) => (
              <Link
                key={v}
                href={`/admin/payment-methods?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}{" "}
                <span className="text-muted-foreground tabular-nums">{n}</span>
              </Link>
            ))}
          </div>
          <form className="w-full sm:w-64">
            <input type="hidden" name="view" value={view} />
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search coin or ticker"
              aria-label="Search payment methods"
              className="bg-background h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
            />
          </form>
        </div>
      )}

      {all.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Wallet}
            title="Add your first payment method"
            body="Users cannot deposit until an asset has a network and a wallet address. Start with a popular one, or add 50+ at once and fill in addresses as you go."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {ASSET_SUGGESTIONS.slice(0, 6).map((a) => (
                  <AddAssetDialog
                    key={a.symbol}
                    preset={a}
                    trigger={
                      <Button variant="outline" size="sm">
                        <CoinLogo symbol={a.symbol} className="size-4" />{" "}
                        {a.symbol}
                      </Button>
                    }
                  />
                ))}
              </div>
            }
          />
        </Panel>
      ) : (
        <>
          {assets.length === 0 && (
            <Panel>
              <EmptyState
                icon={Wallet}
                title="Nothing matches"
                body="Try another tab or search."
              />
            </Panel>
          )}
          <div className="space-y-4">
            {assets.map((a) => (
              <Panel key={a.symbol}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CoinLogo symbol={a.symbol} className="size-10" />
                    <div>
                      <p className="font-semibold">
                        {a.name}{" "}
                        <span className="text-muted-foreground font-normal">
                          · {a.symbol}
                        </span>
                      </p>
                      <StatusBadge status={a.active ? "active" : "suspended"} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <NetworkDialog
                      symbol={a.symbol}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Plus /> Add network
                        </Button>
                      }
                    />
                    <RenameAssetDialog
                      symbol={a.symbol}
                      name={a.name}
                      trigger={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Rename ${a.symbol}`}
                          title="Rename"
                        >
                          <Pencil />
                        </Button>
                      }
                    />
                    <ToastForm action={toggleAssetAction}>
                      <input type="hidden" name="symbol" value={a.symbol} />
                      <IconSubmit
                        label={`${a.active ? "Hide" : "Show"} ${a.symbol}`}
                      >
                        {a.active ? <EyeOff /> : <Eye />}
                      </IconSubmit>
                    </ToastForm>
                    <ConfirmAction
                      trigger={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete ${a.symbol}`}
                          title="Delete"
                        >
                          <Trash2 />
                        </Button>
                      }
                      title={`Delete ${a.symbol}?`}
                      description="This removes the asset and all its networks and addresses. Past deposits and withdrawals keep their records. Hide it instead if you only want to pause it."
                      action={deleteAssetAction}
                      fields={{ symbol: a.symbol }}
                    />
                  </div>
                </div>

                {a.networks.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="No networks yet"
                    body={`Add a network and wallet address so users can deposit ${a.symbol}.`}
                  />
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {a.networks.map((n) => (
                      <li
                        key={n.name}
                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <NetworkLogo network={n.name} />
                            {n.name}
                            {!n.active && (
                              <span className="text-muted-foreground text-xs font-normal">
                                Hidden
                              </span>
                            )}
                            {n.active && !works(a, n) && (
                              <span className="text-gold-foreground text-xs font-normal">
                                Needs an address
                              </span>
                            )}
                            {n.active &&
                              online &&
                              providerCode(
                                a.symbol,
                                n.name,
                                n.providerCode,
                              ) && (
                                <span className="border-success/40 text-success bg-success/10 rounded-md border px-1.5 py-0.5 text-[10px] font-medium">
                                  Automatic
                                </span>
                              )}
                          </p>
                          <p className="text-muted-foreground font-mono text-xs break-all">
                            {n.address ||
                              (works(a, n)
                                ? "Created by the payment provider for each deposit"
                                : "No address set")}
                          </p>
                          {n.memo && (
                            <p className="text-muted-foreground text-xs">
                              Memo: <span className="font-mono">{n.memo}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {n.address && (
                            <CopyButton value={n.address} label="Copy" />
                          )}
                          <NetworkDialog
                            symbol={a.symbol}
                            network={n}
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Edit ${n.name}`}
                                title="Edit"
                              >
                                <Pencil />
                              </Button>
                            }
                          />
                          <ToastForm action={toggleNetworkAction}>
                            <input
                              type="hidden"
                              name="symbol"
                              value={a.symbol}
                            />
                            <input
                              type="hidden"
                              name="network"
                              value={n.name}
                            />
                            <IconSubmit
                              label={`${n.active ? "Hide" : "Show"} ${n.name}`}
                            >
                              {n.active ? <EyeOff /> : <Eye />}
                            </IconSubmit>
                          </ToastForm>
                          <ConfirmAction
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Delete ${n.name}`}
                                title="Delete"
                              >
                                <Trash2 />
                              </Button>
                            }
                            title={`Remove ${n.name}?`}
                            description={`Users will no longer see this ${a.symbol} network. Hide it instead if you may need it again.`}
                            action={deleteNetworkAction}
                            fields={{ symbol: a.symbol, network: n.name }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ))}
          </div>
        </>
      )}
    </>
  );
}
