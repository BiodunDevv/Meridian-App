import type { Metadata } from "next";

import {
  bulkMarkupAction,
  saveCategoryMarkupAction,
  savePricingAction,
} from "@/app/actions/catalogue";
import {
  ActionForm,
  Field,
  SubmitButton,
  TextField,
} from "@/components/app/form";
import { IconSelect } from "@/components/app/icon-input";
import { EmptyState, PageHeader, Panel } from "@/components/app/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { connectDb } from "@/lib/db";
import { Product, ServiceCategory } from "@/lib/models";
import { priceProduct } from "@/lib/services/catalogue";
import { formatMinor, getPricingSettings } from "@/lib/services/pricing";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Pricing" };

type Markup = { type: "percent" | "fixed"; value: number };
type Cat = { _id: string; slug: string; name: string; markup?: Markup };

export default async function PricingPage() {
  await requireAdmin();
  await connectDb();
  const [settings, cats, products] = await Promise.all([
    getPricingSettings(),
    ServiceCategory.find()
      .sort({ sort: 1 })
      .lean()
      .then((r) => plain(r) as unknown as Cat[]),
    Product.find()
      .sort({ categoryId: 1, sort: 1 })
      .limit(60)
      .lean()
      .then((r) => plain(r) as unknown as Record<string, any>[]),
  ]);
  const catById = new Map(cats.map((c) => [c._id, c]));
  const markupValue = (m?: Markup) =>
    m ? String(m.type === "percent" ? m.value / 100 : m.value / 100) : "";

  return (
    <>
      <PageHeader
        title="Pricing"
        description="Customer price is the provider cost plus markup, rounded up, and never below cost plus the minimum margin. Prices are computed on the server."
      />

      <Panel
        title="Defaults"
        description="Used when neither the product nor its category has its own markup."
      >
        <ActionForm
          action={savePricingAction}
          className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3"
          resetOnSuccess={false}
        >
          <TextField
            name="defaultPct"
            label="Default markup (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            defaultValue={settings.defaultMarkupBps / 100}
          />
          <TextField
            name="minPct"
            label="Minimum margin (%)"
            type="number"
            step="0.01"
            min="0"
            max="100"
            required
            defaultValue={settings.minMarginBps / 100}
            hint="A price is never set below cost plus this."
          />
          <TextField
            name="fx"
            label="Naira per US dollar"
            type="number"
            step="0.01"
            min="0"
            defaultValue={settings.fxNgnPerUsd ?? ""}
            hint="Leave empty until you set a rate. USD prices stay hidden without it."
          />
          <div className="sm:col-span-3 sm:justify-self-end">
            <SubmitButton pending="Saving…">Save pricing</SubmitButton>
          </div>
        </ActionForm>
      </Panel>

      <Panel
        title="Category markup"
        description="Overrides the default for every product in the category. Leave Inherit to use the default."
      >
        {cats.length === 0 ? (
          <EmptyState
            title="No categories yet"
            body="Create categories in the catalogue first."
          />
        ) : (
          <div className="divide-y">
            {cats.map((c) => (
              <ActionForm
                key={c._id}
                action={saveCategoryMarkupAction}
                className="grid grid-cols-1 items-end gap-3 py-3 sm:grid-cols-4"
                resetOnSuccess={false}
              >
                <input type="hidden" name="id" value={c._id} />
                <p className="text-sm font-medium sm:pb-2">{c.name}</p>
                <Field label="Type" htmlFor={`t-${c._id}`}>
                  <IconSelect
                    id={`t-${c._id}`}
                    name="markupType"
                    defaultValue={c.markup?.type ?? "inherit"}
                  >
                    <option value="inherit">Inherit default</option>
                    <option value="percent">Percent of cost</option>
                    <option value="fixed">Fixed amount</option>
                  </IconSelect>
                </Field>
                <TextField
                  name="markupValue"
                  label="Value (% or amount)"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={markupValue(c.markup)}
                />
                <SubmitButton size="default" pending="Saving…">
                  Save
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Bulk update"
        description="Set one percent markup on every product in a category (or all), or clear the product-level overrides. Prices still respect the minimum margin."
      >
        <ActionForm
          action={bulkMarkupAction}
          className="grid max-w-3xl grid-cols-1 items-end gap-3 sm:grid-cols-4"
          resetOnSuccess={false}
        >
          <Field label="Apply to" htmlFor="scope">
            <IconSelect name="scope" id="scope" defaultValue="all">
              <option value="all">All products</option>
              {cats.map((c) => (
                <option key={c._id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </IconSelect>
          </Field>
          <Field label="Action" htmlFor="mode">
            <IconSelect name="mode" id="mode" defaultValue="set">
              <option value="set">Set markup %</option>
              <option value="clear">Clear overrides</option>
            </IconSelect>
          </Field>
          <TextField
            name="pct"
            label="Percent"
            type="number"
            step="0.01"
            min="0"
            max="100"
          />
          <SubmitButton size="default" pending="Updating…">
            Apply
          </SubmitButton>
        </ActionForm>
      </Panel>

      <Panel
        title="Price preview"
        description="What customers will pay, with your cost and margin. Showing up to 60 products."
      >
        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            body="Add products in the catalogue to see their prices here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Option</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Customer price</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Other currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.flatMap((p) => {
                const priced = priceProduct(
                  p as never,
                  catById.get(String(p.categoryId)),
                  settings,
                );
                const other = p.currency === "NGN" ? "USD" : "NGN";
                return priced.options.map((o) => (
                  <TableRow key={`${p._id}-${o.label}`}>
                    <TableCell data-label="Product">
                      {p.name}
                      <span className="text-muted-foreground block text-xs">
                        markup from {priced.source}
                      </span>
                    </TableCell>
                    <TableCell data-label="Option">{o.label}</TableCell>
                    <TableCell
                      data-label="Cost"
                      className="text-right tabular-nums"
                    >
                      {formatMinor(o.costMinor, p.currency)}
                    </TableCell>
                    <TableCell
                      data-label="Customer price"
                      className="text-right font-medium tabular-nums"
                    >
                      {formatMinor(o.priceMinor, p.currency)}
                    </TableCell>
                    <TableCell
                      data-label="Margin"
                      className="text-right tabular-nums"
                    >
                      {formatMinor(o.marginMinor, p.currency)}
                      {o.floored ? " (minimum)" : ""}
                    </TableCell>
                    <TableCell
                      data-label="Other currency"
                      className="text-right tabular-nums"
                    >
                      {o.otherMinor === null
                        ? "Set a rate"
                        : formatMinor(o.otherMinor, other)}
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
