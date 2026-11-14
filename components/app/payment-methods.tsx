"use client";

import { Coins, Network, Search, Type } from "lucide-react";
import { useState } from "react";

import {
  addAssetAction,
  saveNetworkAction,
  updateAssetAction,
} from "@/app/actions/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MEMO_HINTS,
  nativeNetwork,
  NETWORK_SUGGESTIONS,
  POPULAR_ASSETS,
} from "@/lib/coins";
import { cn } from "@/lib/utils";

import { CoinLogo } from "./coin-logo";
import { ActionForm, SubmitButton, TextField } from "./form";
import { IconInput } from "./icon-input";

function NetworkFields({
  defaults,
  required,
  symbol,
}: {
  defaults?: {
    network?: string;
    address?: string;
    memo?: string;
    providerCode?: string;
  };
  required?: boolean;
  symbol?: string;
}) {
  const native = symbol ? nativeNetwork(symbol) : "";
  const memoHint = symbol ? MEMO_HINTS[symbol.toUpperCase()] : undefined;
  return (
    <>
      <TextField
        name="network"
        icon={Network}
        label="Network (optional for native coins)"
        placeholder={native ? `Leave empty for ${native}` : "e.g. Tron (TRC20)"}
        list="network-suggestions"
        defaultValue={defaults?.network}
        autoComplete="off"
        hint="Bitcoin, Solana and other native coins have no network to choose, so leave it empty. For tokens like USDT, type the chain they are sent on, for example Tron (TRC20)."
      />
      <datalist id="network-suggestions">
        {NETWORK_SUGGESTIONS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <TextField
        name="address"
        label="Wallet address (optional with online payments)"
        required={false}
        placeholder="Paste your receiving address, or leave empty if the provider creates one"
        defaultValue={defaults?.address}
        autoComplete="off"
        spellCheck={false}
      />
      <TextField
        name="memo"
        label="Memo / tag (optional)"
        hint={
          memoHint
            ? `${memoHint} Only fill this if your receiving wallet or exchange gives you one.`
            : "Only if your receiving wallet or exchange requires one (XRP, Stellar, TON, Cosmos)."
        }
        defaultValue={defaults?.memo}
        autoComplete="off"
      />
      <TextField
        name="providerCode"
        label="Payment provider code (optional)"
        placeholder="e.g. usdttrc20"
        hint="Only needed if automatic detection does not pick the right currency for this network."
        defaultValue={defaults?.providerCode}
        autoComplete="off"
        spellCheck={false}
      />
    </>
  );
}

/** Add a whole new payment method (asset), optionally with its first network. */
export function AddAssetDialog({
  trigger,
  preset,
}: {
  trigger: React.ReactNode;
  preset?: { symbol: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState(preset?.symbol ?? "");
  const [name, setName] = useState(preset?.name ?? "");
  const [query, setQuery] = useState("");
  const firstNetwork =
    POPULAR_ASSETS.find((a) => a.symbol === symbol)?.networks[0] ?? "";
  const matches = POPULAR_ASSETS.filter((a) => {
    const q = query.trim().toLowerCase();
    return (
      !q ||
      a.symbol.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add payment method</DialogTitle>
          <DialogDescription>
            Pick a popular asset or type your own. You can add more networks
            later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <IconInput
            icon={Search}
            name="search"
            placeholder="Search assets"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search assets"
            autoComplete="off"
          />
          <div
            className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4"
            role="listbox"
            aria-label="Popular assets"
          >
            {matches.map((a) => (
              <button
                key={a.symbol}
                type="button"
                role="option"
                aria-selected={symbol === a.symbol}
                onClick={() => {
                  setSymbol(a.symbol);
                  setName(a.name);
                }}
                className={cn(
                  "hover:bg-accent/60 flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                  symbol === a.symbol &&
                    "border-brand bg-brand/5 ring-brand/20 ring-2",
                )}
              >
                <CoinLogo symbol={a.symbol} className="size-5" />
                <span className="truncate font-medium">{a.symbol}</span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="text-muted-foreground col-span-full py-3 text-center text-xs">
                No match. Type your own ticker below.
              </p>
            )}
          </div>
        </div>

        <ActionForm action={addAssetAction} onSuccess={() => setOpen(false)}>
          <div className="flex items-end gap-3">
            <CoinLogo symbol={symbol || "?"} className="mb-1 size-9" />
            <div className="flex-1">
              <TextField
                name="symbol"
                icon={Coins}
                label="Ticker"
                placeholder="USDT"
                required
                autoComplete="off"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          <TextField
            name="name"
            icon={Type}
            label="Asset name"
            placeholder="Tether"
            required
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="space-y-4 border-t pt-4">
            <p className="text-sm font-medium">First network (optional)</p>
            <NetworkFields
              key={symbol + firstNetwork}
              symbol={symbol}
              defaults={{ network: firstNetwork }}
            />
          </div>
          <SubmitButton pending="Adding…">Add payment method</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Add a network to an asset, or edit an existing one. */
export function NetworkDialog({
  trigger,
  symbol,
  network,
}: {
  trigger: React.ReactNode;
  symbol: string;
  network?: {
    name: string;
    address: string;
    memo?: string;
    providerCode?: string;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {network ? `Edit ${network.name}` : `Add a ${symbol} network`}
          </DialogTitle>
          <DialogDescription>
            Users see only networks that are visible and have an address. Check
            the address carefully: funds sent to a wrong address cannot be
            recovered.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={saveNetworkAction}
          onSuccess={() => setOpen(false)}
          resetOnSuccess={!network}
        >
          <input type="hidden" name="symbol" value={symbol} />
          <input type="hidden" name="original" value={network?.name ?? ""} />
          <NetworkFields
            required
            symbol={symbol}
            defaults={network ?? { network: "" }}
          />
          <SubmitButton pending="Saving…">
            {network ? "Save changes" : "Add network"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

export function RenameAssetDialog({
  trigger,
  symbol,
  name,
}: {
  trigger: React.ReactNode;
  symbol: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename {symbol}</DialogTitle>
          <DialogDescription>
            This is the display name users see.
          </DialogDescription>
        </DialogHeader>
        <ActionForm
          action={updateAssetAction}
          onSuccess={() => setOpen(false)}
          resetOnSuccess={false}
        >
          <input type="hidden" name="symbol" value={symbol} />
          <TextField
            name="name"
            icon={Type}
            label="Asset name"
            defaultValue={name}
            required
          />
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
