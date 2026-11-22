import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { applySyncAction } from "@/app/actions/catalogue";
import { SubmitButton } from "@/components/app/form";
import { ToastForm } from "@/components/app/toast-form";
import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Provider } from "@/lib/models";
import { previewSync, type SyncPreview } from "@/lib/services/catalogue-sync";
import { formatMinor } from "@/lib/services/pricing";

export const metadata: Metadata = { title: "Catalogue sync" };
export const dynamic = "force-dynamic";

export default async function SyncPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const key = sp.provider ?? "";
  await connectDb();
  const doc = key ? await Provider.findOne({ key }).lean() : null;
  let preview: SyncPreview | null = null;
  let error = "";
  if (doc) {
    try {
      preview = await previewSync(
        key,
        doc.mode as "sandbox" | "live",
        sp.country,
      );
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : "Could not read the provider's catalogue.";
    }
  }
  const empty =
    preview &&
    !preview.added.length &&
    !preview.changed.length &&
    !preview.missing.length;

  return (
    <>
      <PageHeader
        title={doc ? `Sync from ${doc.name}` : "Catalogue sync"}
        description="Compare the provider's catalogue with yours and choose what to import. Nothing changes until you press Apply. New products arrive hidden, and your markup, status and order are never overwritten."
        action={
          <Link
            href="/admin/providers"
            className="text-brand inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Providers
          </Link>
        }
      />
      {!doc && (
        <Panel>
          <EmptyState
            title="Choose a provider"
            body="Open this page from Admin > Providers."
          />
        </Panel>
      )}
      {error && (
        <p
          role="alert"
          className="border-destructive-foreground/40 bg-destructive-foreground/5 rounded-xl border px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}
      {empty && (
        <Panel>
          <EmptyState
            title="Already in sync"
            body="The provider's catalogue matches yours."
          />
        </Panel>
      )}
      {preview && !empty && (
        <ToastForm action={applySyncAction} className="space-y-4">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="country" value={sp.country ?? ""} />
          {preview.noCategory.length > 0 && (
            <p className="text-muted-foreground text-sm">
              {preview.noCategory.length} item(s) were skipped because their
              category does not exist yet. Create it in the catalogue first.
            </p>
          )}
          {preview.added.length > 0 && (
            <Panel
              title={`New (${preview.added.length})`}
              description="Imported as hidden. Review the cost, then show them."
            >
              <ul className="divide-y text-sm">
                {preview.added.map((i) => (
                  <li key={i.providerCode} className="py-2">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="pick"
                        value={`add:${i.providerCode}`}
                        defaultChecked
                        className="mt-1 size-4"
                      />
                      <span>
                        <span className="font-medium">{i.name}</span>{" "}
                        <span className="text-muted-foreground">
                          · {i.categorySlug} · {i.providerCode}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {i.kind === "open"
                            ? `Open amount ${formatMinor(i.minMinor, i.currency)} to ${formatMinor(i.maxMinor, i.currency)}`
                            : i.denominations
                                .map(
                                  (d) =>
                                    `${d.label} (cost ${formatMinor(d.costMinor, i.currency)})`,
                                )
                                .join(", ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {preview.changed.length > 0 && (
            <Panel
              title={`Changed (${preview.changed.length})`}
              description="Name, size or cost differs from yours."
            >
              <ul className="divide-y text-sm">
                {preview.changed.map(({ item, changes }) => (
                  <li key={item.providerCode} className="py-2">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="pick"
                        value={`chg:${item.providerCode}`}
                        defaultChecked
                        className="mt-1 size-4"
                      />
                      <span>
                        <span className="font-medium">{item.name}</span>
                        <span className="text-muted-foreground block text-xs">
                          {changes.join("; ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {preview.missing.length > 0 && (
            <Panel
              title={`No longer listed (${preview.missing.length})`}
              description="Ticking these marks them out of stock. They are not deleted."
            >
              <ul className="divide-y text-sm">
                {preview.missing.map((m) => (
                  <li key={m.id} className="py-2">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="pick"
                        value={`miss:${m.providerCode}`}
                        className="mt-1 size-4"
                      />
                      <span>
                        <span className="font-medium">{m.name}</span>{" "}
                        <span className="text-muted-foreground">
                          · {m.providerCode}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <SubmitButton pending="Applying…">
            Apply selected changes
          </SubmitButton>
        </ToastForm>
      )}
    </>
  );
}
