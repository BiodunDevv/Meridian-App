"use client";

import { useState } from "react";

import { saveCategoryAction, saveProductAction } from "@/app/actions/catalogue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { ActionForm, Field, SubmitButton, TextField } from "./form";
import { IconSelect } from "./icon-input";

export interface ProductFormData {
  id?: string;
  name?: string;
  categoryId?: string;
  providerKey?: string;
  providerCode?: string;
  kind?: "fixed" | "open";
  currency?: "NGN" | "USD";
  logo?: string;
  notes?: string;
  /** Major units (naira or dollars), as text. */
  min?: string;
  max?: string;
  costPct?: string;
  denominations?: string;
  inputs?: string;
  viewOnce?: boolean;
  emailCodes?: boolean;
  markupType?: "inherit" | "percent" | "fixed";
  markupValue?: string;
}

const INPUT_HELP =
  "One input per line: key | label | type | required | pattern or options. Types: phone, number, text, email, select. Example: phone | Phone number | phone | yes | ^0[789][01]\\d{8}$";

function MarkupFields({
  type = "inherit",
  value = "",
}: {
  type?: string;
  value?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Markup" htmlFor="markupType">
        <IconSelect
          name="markupType"
          id="markupType"
          defaultValue={type}
          aria-label="Markup type"
        >
          <option value="inherit">Inherit (category or default)</option>
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
        defaultValue={value}
        hint="Never below the minimum margin."
      />
    </div>
  );
}

/** Create or edit a product, including its input fields, denominations and markup. */
export function ProductDialog({
  trigger,
  product,
  categories,
  providers,
}: {
  trigger: React.ReactNode;
  product?: ProductFormData;
  categories: { id: string; name: string }[];
  providers: { key: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"fixed" | "open">(product?.kind ?? "fixed");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {product?.id ? "Edit product" : "New product"}
          </DialogTitle>
          <DialogDescription>
            Costs are what the provider charges you. The customer price is
            computed from cost and markup on the server.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={saveProductAction}
          resetOnSuccess={!product?.id}
          onSuccess={() => setOpen(false)}
        >
          {product?.id && <input type="hidden" name="id" value={product.id} />}
          <TextField
            name="name"
            label="Name"
            required
            defaultValue={product?.name}
            placeholder="MTN Airtime"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="categoryId">
              <IconSelect
                name="categoryId"
                id="categoryId"
                required
                defaultValue={product?.categoryId ?? ""}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </IconSelect>
            </Field>
            <Field label="Provider" htmlFor="providerKey">
              <IconSelect
                name="providerKey"
                id="providerKey"
                required
                defaultValue={product?.providerKey ?? ""}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {providers.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </IconSelect>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              name="providerCode"
              label="Provider product code"
              required
              defaultValue={product?.providerCode}
              placeholder="mtn"
            />
            <Field label="Currency" htmlFor="currency">
              <IconSelect
                name="currency"
                id="currency"
                defaultValue={product?.currency ?? "NGN"}
              >
                <option value="NGN">NGN (kobo)</option>
                <option value="USD">USD (cents)</option>
              </IconSelect>
            </Field>
          </div>
          <Field label="How the customer chooses" htmlFor="kind">
            <IconSelect
              name="kind"
              id="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "fixed" | "open")}
            >
              <option value="fixed">Fixed denominations</option>
              <option value="open">Open amount (min to max)</option>
            </IconSelect>
          </Field>
          {kind === "fixed" ? (
            <Field
              label="Denominations"
              htmlFor="denominations"
              hint="One per line: label | value | cost. Whole currency units, e.g. MTN 1.5GB | 1000 | 970"
            >
              <Textarea
                id="denominations"
                name="denominations"
                rows={4}
                defaultValue={product?.denominations}
                className="font-mono text-xs"
              />
            </Field>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <TextField
                name="min"
                label="Minimum"
                type="number"
                step="0.01"
                min="0"
                defaultValue={product?.min}
              />
              <TextField
                name="max"
                label="Maximum"
                type="number"
                step="0.01"
                min="0"
                defaultValue={product?.max}
              />
              <TextField
                name="costPct"
                label="Our cost %"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                defaultValue={product?.costPct ?? "100"}
                hint="Of face value."
              />
            </div>
          )}
          <MarkupFields
            type={product?.markupType}
            value={product?.markupValue}
          />
          <Field
            label="Input fields (optional)"
            htmlFor="inputs"
            hint={`Leave empty to use the category's inputs. ${INPUT_HELP}`}
          >
            <Textarea
              id="inputs"
              name="inputs"
              rows={3}
              defaultValue={product?.inputs}
              className="font-mono text-xs"
            />
          </Field>
          <TextField
            name="logo"
            label="Logo URL (optional)"
            defaultValue={product?.logo}
          />
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="viewOnce"
                defaultChecked={product?.viewOnce}
                className="mt-1 size-4"
              />
              Show the code or token to the customer only once
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="emailCodes"
                defaultChecked={product?.emailCodes}
                className="mt-1 size-4"
              />
              Allow the code in the delivery email (off by default, codes stay
              on the order page)
            </label>
          </div>
          <TextField
            name="notes"
            label="Delivery notes (optional)"
            defaultValue={product?.notes}
          />
          <SubmitButton pending="Saving…">
            {product?.id ? "Save product" : "Create product"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryDialog({
  trigger,
  category,
}: {
  trigger: React.ReactNode;
  category?: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    inputs: string;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit category" : "New category"}
          </DialogTitle>
          <DialogDescription>
            Inputs set here are asked for every product in the category.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={saveCategoryAction}
          resetOnSuccess={!category}
          onSuccess={() => setOpen(false)}
        >
          {category && <input type="hidden" name="id" value={category.id} />}
          <TextField
            name="name"
            label="Name"
            required
            defaultValue={category?.name}
            placeholder="Airtime"
          />
          <TextField
            name="slug"
            label="Slug"
            required
            defaultValue={category?.slug}
            placeholder="airtime"
          />
          <TextField
            name="icon"
            label="Icon name"
            defaultValue={category?.icon ?? "Package"}
            hint="A lucide icon name, e.g. Smartphone, Wifi, Zap, Tv, Gift."
          />
          <Field label="Input fields" htmlFor="inputs" hint={INPUT_HELP}>
            <Textarea
              id="inputs"
              name="inputs"
              rows={4}
              defaultValue={category?.inputs}
              className="font-mono text-xs"
            />
          </Field>
          <SubmitButton pending="Saving…">
            {category ? "Save category" : "Create category"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
