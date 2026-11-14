"use client";

import { Check, ChevronsUpDown, Globe, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { COUNTRIES, flag } from "@/lib/countries";
import { cn } from "@/lib/utils";

/** A searchable list of every country. Submits the country name in a hidden input. */
export function CountryPicker({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = COUNTRIES.find(([, n]) => n === value);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? COUNTRIES.filter(
          ([c, n]) => n.toLowerCase().includes(t) || c.toLowerCase() === t,
        )
      : COUNTRIES;
  }, [q]);

  return (
    <div ref={root} className="relative flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="text"
        name={name}
        value={value}
        required={required}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 h-0 w-full opacity-0"
      />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent/40 focus-visible:ring-ring flex h-10 w-full items-center gap-2.5 rounded-lg border px-3 text-left text-sm transition-colors outline-none focus-visible:ring-2"
      >
        {selected ? (
          <span className="text-base leading-none" aria-hidden="true">
            {flag(selected[0])}
          </span>
        ) : (
          <Globe className="text-muted-foreground size-4" aria-hidden="true" />
        )}
        <span
          className={cn(
            "flex-1 truncate",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? selected[1] : "Select your country"}
        </span>
        <ChevronsUpDown
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="bg-popover absolute top-full z-30 mt-1.5 w-full overflow-hidden rounded-xl border shadow-lg">
          <div className="flex items-center gap-2 border-b px-3">
            <Search
              className="text-muted-foreground size-4"
              aria-hidden="true"
            />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search countries"
              aria-label="Search countries"
              className="h-10 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            className="max-h-64 overflow-y-auto p-1"
          >
            {shown.length === 0 && (
              <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                No country matches “{q}”.
              </li>
            )}
            {shown.map(([code, n]) => (
              <li key={code} role="option" aria-selected={n === value}>
                <button
                  type="button"
                  onClick={() => {
                    setValue(n);
                    setOpen(false);
                    setQ("");
                  }}
                  className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm"
                >
                  <span className="text-base leading-none" aria-hidden="true">
                    {flag(code)}
                  </span>
                  <span className="flex-1 truncate">{n}</span>
                  {n === value && (
                    <Check className="text-brand size-4" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
