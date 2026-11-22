import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  PackageX,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { Metadata } from "next";

import {
  deleteProductAction,
  moveCategoryAction,
  moveProductAction,
  setProductStatusAction,
  toggleCategoryAction,
} from "@/app/actions/catalogue";
import {
  CategoryDialog,
  ProductDialog,
  type ProductFormData,
} from "@/components/app/catalogue-dialogs";
import { IconSubmit } from "@/components/app/form";
import { Pagination } from "@/components/app/pagination";
import { TableToolbar } from "@/components/app/table-toolbar";
import { ConfirmAction, ToastForm } from "@/components/app/toast-form";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatusBadge,
} from "@/components/app/ui";
import { Button } from "@/components/ui/button";
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
import { Provider, ServiceCategory } from "@/lib/models";
import {
  denominationsToLines,
  type InputDef,
  inputsToLines,
  listProducts,
  priceProduct,
} from "@/lib/services/catalogue";
import { formatMinor, getPricingSettings } from "@/lib/services/pricing";
import { plain } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Catalogue" };

type Cat = {
  _id: string;
  slug: string;
  name: string;
  icon: string;
  active: boolean;
  inputs: InputDef[];
  markup?: { type: "percent" | "fixed"; value: number };
};
type Prod = {
  _id: string;
  name: string;
  categoryId: string;
  providerKey: string;
  providerCode: string;
  kind: "fixed" | "open";
  currency: "NGN" | "USD";
  logo?: string;
  notes?: string;
  denominations: { label: string; valueMinor: number; costMinor: number }[];
  minMinor: number;
  maxMinor: number;
  costBps: number;
  markup?: { type: "percent" | "fixed"; value: number };
  inputs: InputDef[];
  status: "active" | "hidden" | "out_of_stock";
  viewOnce?: boolean;
  emailCodes?: boolean;
};

const STATUS_LABEL = {
  active: "Active",
  hidden: "Hidden",
  out_of_stock: "Out of stock",
};

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  await connectDb();
  const query = {
    q: sp.q?.trim() || undefined,
    category: sp.category || undefined,
    status: sp.status || undefined,
    provider: sp.provider || undefined,
    page: Math.max(1, parseInt(sp.page ?? "1", 10) || 1),
  };
  const [cats, providers, settings, list] = await Promise.all([
    ServiceCategory.find()
      .sort({ sort: 1, createdAt: 1 })
      .lean()
      .then((r) => plain(r) as unknown as Cat[]),
    Provider.find()
      .sort({ priority: 1 })
      .lean()
      .then(
        (r) =>
          plain(r) as unknown as {
            key: string;
            name: string;
            active: boolean;
          }[],
      ),
    getPricingSettings(),
    listProducts(query),
  ]);
  const products = list.rows as Prod[];
  const catById = new Map(cats.map((c) => [c._id, c]));
  const catOptions = cats.map((c) => ({ id: c._id, name: c.name }));
  const provOptions = providers.map((p) => ({ key: p.key, name: p.name }));

  const toForm = (p: Prod): ProductFormData => ({
    id: p._id,
    name: p.name,
    categoryId: p.categoryId,
    providerKey: p.providerKey,
    providerCode: p.providerCode,
    kind: p.kind,
    currency: p.currency,
    logo: p.logo,
    notes: p.notes,
    min: p.minMinor ? String(p.minMinor / 100) : "",
    max: p.maxMinor ? String(p.maxMinor / 100) : "",
    costPct: String((p.costBps ?? 10000) / 100),
    denominations: denominationsToLines(p.denominations),
    inputs: inputsToLines(p.inputs),
    viewOnce: p.viewOnce,
    emailCodes: p.emailCodes,
    markupType: p.markup?.type ?? "inherit",
    markupValue: p.markup
      ? String(
          p.markup.type === "percent"
            ? p.markup.value / 100
            : p.markup.value / 100,
        )
      : "",
  });

  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Categories and products. Customers only see active products whose provider is switched on. Prices are computed from cost and markup on the server."
        action={
          <div className="flex flex-wrap gap-2">
            <CategoryDialog
              trigger={
                <Button variant="outline">
                  <Plus /> New category
                </Button>
              }
            />
            <ProductDialog
              categories={catOptions}
              providers={provOptions}
              trigger={
                <Button disabled={cats.length === 0 || providers.length === 0}>
                  <Plus /> New product
                </Button>
              }
            />
          </div>
        }
      />

      <Panel
        title="Categories"
        description="Order here is the order on the storefront."
      >
        {cats.length === 0 ? (
          <EmptyState
            title="No categories yet"
            body="Create one, or run npm run seed:catalogue to load sample data that uses the mock provider only."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {cats.map((c) => (
              <li
                key={c._id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {c.name}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {c.slug}
                    </span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {c.inputs.length} input field
                    {c.inputs.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge
                    status={c.active ? "active" : "suspended"}
                    label={c.active ? "Visible" : "Hidden"}
                  />
                  {(["up", "down"] as const).map((dir) => (
                    <ToastForm key={dir} action={moveCategoryAction}>
                      <input type="hidden" name="id" value={c._id} />
                      <input type="hidden" name="dir" value={dir} />
                      <IconSubmit label={`Move ${c.name} ${dir}`}>
                        {dir === "up" ? <ArrowUp /> : <ArrowDown />}
                      </IconSubmit>
                    </ToastForm>
                  ))}
                  <CategoryDialog
                    category={{
                      id: c._id,
                      name: c.name,
                      slug: c.slug,
                      icon: c.icon,
                      inputs: inputsToLines(c.inputs),
                    }}
                    trigger={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil />
                      </Button>
                    }
                  />
                  <ToastForm action={toggleCategoryAction}>
                    <input type="hidden" name="id" value={c._id} />
                    <IconSubmit
                      label={`${c.active ? "Hide" : "Show"} ${c.name}`}
                    >
                      {c.active ? <EyeOff /> : <Eye />}
                    </IconSubmit>
                  </ToastForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Products">
        <TableToolbar
          placeholder="Search name or provider code"
          exportResource="products"
          filters={[
            {
              key: "category",
              label: "Category",
              options: cats.map((c) => ({ value: c.slug, label: c.name })),
            },
            {
              key: "status",
              label: "Status",
              options: Object.entries(STATUS_LABEL).map(([value, label]) => ({
                value,
                label,
              })),
            },
            {
              key: "provider",
              label: "Provider",
              options: providers.map((p) => ({ value: p.key, label: p.name })),
            },
          ]}
        />
        {products.length === 0 ? (
          <EmptyState
            icon={PackageX}
            title="No products match"
            body="Add a product, change the filters, or run npm run seed:catalogue for sample data."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Customer price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const cat = catById.get(String(p.categoryId));
                const priced = priceProduct(p, cat, settings);
                const first = priced.options[0];
                const last = priced.options[priced.options.length - 1];
                const range = (f: (o: typeof first) => number) =>
                  !first
                    ? "None"
                    : first === last || f(first) === f(last)
                      ? formatMinor(f(first), p.currency)
                      : `${formatMinor(f(first), p.currency)} to ${formatMinor(f(last), p.currency)}`;
                return (
                  <TableRow key={p._id}>
                    <TableCell data-label="Product">
                      <span className="block font-medium">{p.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {p.providerKey} · {p.providerCode}
                      </span>
                    </TableCell>
                    <TableCell data-label="Category">
                      {cat?.name ?? "None"}
                    </TableCell>
                    <TableCell
                      data-label="Cost"
                      className="text-right tabular-nums"
                    >
                      {range((o) => o.costMinor)}
                    </TableCell>
                    <TableCell
                      data-label="Customer price"
                      className="text-right tabular-nums"
                    >
                      {range((o) => o.priceMinor)}
                      <span className="text-muted-foreground block text-xs">
                        markup from {priced.source}
                        {priced.options.some((o) => o.floored)
                          ? ", raised to minimum margin"
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell data-label="Status">
                      <StatusBadge
                        status={
                          p.status === "active"
                            ? "active"
                            : p.status === "hidden"
                              ? "suspended"
                              : "pending"
                        }
                        label={STATUS_LABEL[p.status]}
                      />
                    </TableCell>
                    <TableCell data-label="">
                      <div className="flex flex-wrap items-center gap-1">
                        <ToastForm action={setProductStatusAction}>
                          <input type="hidden" name="id" value={p._id} />
                          <input
                            type="hidden"
                            name="status"
                            value={p.status === "active" ? "hidden" : "active"}
                          />
                          <IconSubmit
                            label={
                              p.status === "active"
                                ? `Hide ${p.name}`
                                : `Show ${p.name}`
                            }
                          >
                            {p.status === "active" ? <EyeOff /> : <Eye />}
                          </IconSubmit>
                        </ToastForm>
                        <ToastForm action={setProductStatusAction}>
                          <input type="hidden" name="id" value={p._id} />
                          <input
                            type="hidden"
                            name="status"
                            value={
                              p.status === "out_of_stock"
                                ? "active"
                                : "out_of_stock"
                            }
                          />
                          <IconSubmit
                            label={
                              p.status === "out_of_stock"
                                ? `Back in stock: ${p.name}`
                                : `Mark ${p.name} out of stock`
                            }
                          >
                            <PackageX />
                          </IconSubmit>
                        </ToastForm>
                        {(["up", "down"] as const).map((dir) => (
                          <ToastForm key={dir} action={moveProductAction}>
                            <input type="hidden" name="id" value={p._id} />
                            <input type="hidden" name="dir" value={dir} />
                            <IconSubmit label={`Move ${p.name} ${dir}`}>
                              {dir === "up" ? <ArrowUp /> : <ArrowDown />}
                            </IconSubmit>
                          </ToastForm>
                        ))}
                        <ProductDialog
                          product={toForm(p)}
                          categories={catOptions}
                          providers={provOptions}
                          trigger={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Edit ${p.name}`}
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                        <ConfirmAction
                          trigger={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Delete ${p.name}`}
                            >
                              <Trash2 />
                            </Button>
                          }
                          title={`Delete ${p.name}?`}
                          description="This removes the product from the catalogue. Hide it instead if you may need it again."
                          action={deleteProductAction}
                          fields={{ id: p._id }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <Pagination
          basePath="/admin/catalogue"
          query={{
            q: query.q,
            category: query.category,
            status: query.status,
            provider: query.provider,
          }}
          page={list.page}
          pages={list.pages}
          total={list.total}
          pageSize={list.pageSize}
        />
      </Panel>
    </>
  );
}
