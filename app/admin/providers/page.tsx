import { AlertTriangle, Plug, Plus } from "lucide-react";
import type { Metadata } from "next";

import {
  addProviderAction,
  refreshBalanceAction,
  testConnectionAction,
  toggleProviderAction,
} from "@/app/actions/catalogue";
import { SubmitButton } from "@/components/app/form";
import { ProviderDialog } from "@/components/app/provider-dialog";
import { ToastForm } from "@/components/app/toast-form";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { FloatTopUp, Product, Provider } from "@/lib/models";
import { formatDateTime } from "@/lib/money";
import { formatMinor } from "@/lib/services/pricing";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Providers" };

type P = {
  _id: string;
  key: string;
  name: string;
  mode: "sandbox" | "live";
  active: boolean;
  priority: number;
  lowBalanceMinor: number;
  lastBalanceMinor?: number;
  lastBalanceCurrency?: "NGN" | "USD";
  lastCheckedAt?: string;
  status: string;
};
const KNOWN = [
  ["mock", "Mock provider"],
  ["vtpass", "VTpass"],
] as const;

export default async function ProvidersPage() {
  await requireAdmin();
  await connectDb();
  const [providers, counts, topups] = await Promise.all([
    Provider.find()
      .sort({ priority: 1 })
      .lean()
      .then((r) => plain(r) as unknown as P[]),
    Product.aggregate([
      { $group: { _id: "$providerKey", n: { $sum: 1 } } },
    ]) as Promise<{ _id: string; n: number }[]>,
    FloatTopUp.find()
      .sort({ at: -1 })
      .limit(10)
      .lean()
      .then(
        (r) =>
          plain(r) as unknown as {
            _id: string;
            providerKey: string;
            amountMinor: number;
            note?: string;
            by?: string;
            at: string;
          }[],
      ),
  ]);
  const have = new Set(providers.map((p) => p.key));
  const missing = KNOWN.filter(([k]) => !have.has(k));
  const productCount = (k: string) => counts.find((c) => c._id === k)?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Providers"
        description="Who fulfils orders. Turning a provider off hides its products from the storefront. Live mode spends real money; credentials are read from the server environment, never stored here."
        action={
          <div className="flex flex-wrap gap-2">
            {missing.map(([k, name]) => (
              <ToastForm key={k} action={addProviderAction}>
                <input type="hidden" name="key" value={k} />
                <SubmitButton
                  variant="outline"
                  size="default"
                  pending="Adding…"
                >
                  <Plus /> Add {name}
                </SubmitButton>
              </ToastForm>
            ))}
          </div>
        }
      />
      {providers.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Plug}
            title="No providers yet"
            body="Add the mock provider to test, or VTpass in sandbox mode."
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {providers.map((p) => {
            const low =
              p.lowBalanceMinor > 0 &&
              p.lastBalanceMinor !== undefined &&
              p.lastBalanceMinor < p.lowBalanceMinor;
            return (
              <Panel key={p._id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {p.name}{" "}
                      <span className="text-muted-foreground font-normal">
                        · {p.key}
                      </span>
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={p.active ? "active" : "suspended"}
                        label={p.active ? "On" : "Off"}
                      />
                      <StatusBadge
                        status={p.mode === "live" ? "pending" : "none"}
                        label={p.mode === "live" ? "Live" : "Sandbox"}
                      />
                      <span className="text-muted-foreground text-xs">
                        {productCount(p.key)} products · priority {p.priority}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProviderDialog
                      provider={{
                        id: p._id,
                        key: p.key,
                        mode: p.mode,
                        priority: p.priority,
                        low: String(p.lowBalanceMinor / 100),
                        name: p.name,
                        isMock: p.key === "mock",
                      }}
                      trigger={
                        <Button variant="outline" size="sm">
                          Settings
                        </Button>
                      }
                    />
                    <ToastForm action={toggleProviderAction}>
                      <input type="hidden" name="id" value={p._id} />
                      <SubmitButton
                        variant={p.active ? "outline" : "default"}
                        size="sm"
                        pending="Saving…"
                      >
                        {p.active ? "Turn off" : "Turn on"}
                      </SubmitButton>
                    </ToastForm>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Last balance</dt>
                    <dd className="font-medium tabular-nums">
                      {p.lastBalanceMinor === undefined
                        ? "Not checked yet"
                        : formatMinor(
                            p.lastBalanceMinor,
                            p.lastBalanceCurrency ?? "NGN",
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Low-balance alert</dt>
                    <dd className="font-medium tabular-nums">
                      {p.lowBalanceMinor
                        ? formatMinor(
                            p.lowBalanceMinor,
                            p.lastBalanceCurrency ?? "NGN",
                          )
                        : "Off"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Last checked</dt>
                    <dd className="font-medium">
                      {p.lastCheckedAt
                        ? formatDateTime(p.lastCheckedAt)
                        : "Never"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-medium capitalize">{p.status}</dd>
                  </div>
                </dl>
                {low && (
                  <p
                    role="alert"
                    className="border-gold/50 bg-gold/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <AlertTriangle className="size-4" aria-hidden="true" />{" "}
                    Balance is below your threshold. Top up before orders fail.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      [testConnectionAction, "Test connection"],
                      [refreshBalanceAction, "Refresh balance"],
                    ] as const
                  ).map(([action, label]) => (
                    <ToastForm key={label} action={action}>
                      <input type="hidden" name="key" value={p.key} />
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        pending="Checking…"
                      >
                        {label}
                      </SubmitButton>
                    </ToastForm>
                  ))}
                  <Button asChild variant="outline" size="sm">
                    <a href={`/admin/catalogue/sync?provider=${p.key}`}>
                      Sync catalogue
                    </a>
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      {topups.length > 0 && (
        <Panel
          title="Recent float top-ups"
          description="Money you paid into a provider wallet. Recorded by hand."
        >
          <ul className="divide-y text-sm">
            {topups.map((t) => (
              <li
                key={t._id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  <span className="font-medium">{t.providerKey}</span>{" "}
                  <span className="text-muted-foreground">{t.note || ""}</span>
                </span>
                <span className="tabular-nums">
                  {formatMinor(t.amountMinor, "NGN")}{" "}
                  <span className="text-muted-foreground text-xs">
                    · {formatDateTime(t.at)} · {t.by}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
