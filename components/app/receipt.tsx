"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import Meridian from "@/components/logos/meridian";

export type ReceiptRow = [label: string, value: string, mono?: boolean];

/** Screen-only toolbar: back, print. Opens the print dialog straight away when asked (?print=1). */
export function ReceiptToolbar({
  backHref,
  autoPrint,
}: {
  backHref: string;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [autoPrint]);
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[760px] items-center justify-between print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> Back
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2459f2] px-4 text-sm font-medium text-white hover:bg-[#1d4bd4]"
      >
        <Printer className="size-4" aria-hidden="true" /> Print or save as PDF
      </button>
    </div>
  );
}

function Block({ title, rows }: { title: string; rows: ReceiptRow[] }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
        {title}
      </h2>
      <dl className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
        {rows.map(([label, value, mono]) => (
          <div
            key={label}
            className="grid grid-cols-[9rem_minmax(0,1fr)] gap-4 px-4 py-2.5 text-sm"
          >
            <dt className="text-neutral-500">{label}</dt>
            <dd
              className={`text-right font-medium break-all text-neutral-900 ${mono ? "font-mono text-xs leading-5" : ""}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A clean, light, A4-friendly receipt. Always black on white, whatever theme the site is in. */
export function ReceiptSheet({
  title,
  number,
  issued,
  headline,
  amount,
  status,
  statusDate,
  account,
  details,
  references,
  note,
  site,
  risk,
}: {
  title: string;
  number: string;
  issued: string;
  headline: string;
  amount: string;
  status: string;
  statusDate?: string;
  account: ReceiptRow[];
  details: ReceiptRow[];
  references?: ReceiptRow[];
  note: string;
  site: string;
  risk: string;
}) {
  return (
    <article className="mx-auto w-full max-w-[760px] rounded-2xl border border-neutral-200 bg-white p-8 text-neutral-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-6">
        <Meridian className="text-3xl text-neutral-900" />
        <div className="text-right">
          <p className="text-lg font-semibold tracking-tight">{title}</p>
          <p className="font-mono text-xs text-neutral-500">No. {number}</p>
          <p className="text-xs text-neutral-500">Issued {issued}</p>
        </div>
      </header>

      <div className="my-8 flex flex-wrap items-end justify-between gap-4 rounded-xl bg-neutral-50 px-6 py-5">
        <div>
          <p className="text-xs text-neutral-500">{headline}</p>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {amount}
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            {status}
          </span>
          {statusDate && (
            <p className="mt-1.5 text-xs text-neutral-500">{statusDate}</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <Block title="Account" rows={account} />
        <Block title="Details" rows={details} />
        {references && references.length > 0 && (
          <Block title="Transaction references" rows={references} />
        )}
      </div>

      <footer className="mt-10 space-y-3 border-t border-neutral-200 pt-5 text-xs leading-5 text-neutral-500">
        <p>{note}</p>
        <p>
          Keep this receipt for your records. Questions about this transaction?
          Open a support request from your dashboard and quote the number above.
        </p>
        <p className="text-neutral-400">{risk}</p>
        <p className="flex justify-between text-neutral-400">
          <span>{site}</span>
          <span>Generated {issued}</span>
        </p>
      </footer>
    </article>
  );
}
