import { coinLogo } from "../coins";
import { log } from "../log";

/** CoinGecko ids for the assets we list. Stablecoins are pegged to 1 USD and need no lookup. */
const IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  TON: "the-open-network",
  TRX: "tron",
  DOGE: "dogecoin",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LTC: "litecoin",
  DOT: "polkadot",
  MATIC: "matic-network",
  LINK: "chainlink",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  ATOM: "cosmos",
  NEAR: "near",
  SUI: "sui",
  APT: "aptos",
  ARB: "arbitrum",
  OP: "optimism",
  UNI: "uniswap",
  ETC: "ethereum-classic",
  XMR: "monero",
  SHIB: "shiba-inu",
  PEPE: "pepe",
  AAVE: "aave",
  MKR: "maker",
  LDO: "lido-dao",
  ZEC: "zcash",
  DASH: "dash",
  ALGO: "algorand",
  FIL: "filecoin",
  HBAR: "hedera-hashgraph",
  ICP: "internet-computer",
  VET: "vechain",
  XTZ: "tezos",
  EOS: "eos",
  CRO: "crypto-com-chain",
  FTM: "fantom",
  CAKE: "pancakeswap-token",
  SAND: "the-sandbox",
  MANA: "decentraland",
  GRT: "the-graph",
  SEI: "sei-network",
  TIA: "celestia",
  IMX: "immutable-x",
  FLOW: "flow",
  KAVA: "kava",
  RUNE: "thorchain",
  EGLD: "elrond-erd-2",
  IOTA: "iota",
  CHZ: "chiliz",
};

export const STABLE = new Set(["USDT", "USDC", "DAI"]);
const TTL = 60_000;
const STALE_OK = 15 * 60_000;

let cache: { at: number; prices: Record<string, number> } | null = null;
let inflight: Promise<void> | null = null;

async function refresh() {
  try {
    const ids = Array.from(new Set(Object.values(IDS))).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) throw new Error(`price feed ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};
    for (const [sym, id] of Object.entries(IDS)) {
      const usd = json[id]?.usd;
      if (typeof usd === "number" && usd > 0) prices[sym] = usd;
    }
    if (Object.keys(prices).length) cache = { at: Date.now(), prices };
  } catch (e) {
    log.error("[prices] refresh failed", e instanceof Error ? e.message : e);
  }
}

/** USD price of one unit, or null when no recent price is available. Stablecoins are always 1. */
export async function getUsdPrice(symbol: string): Promise<number | null> {
  const s = symbol.toUpperCase();
  if (STABLE.has(s)) return 1;
  if (!cache || Date.now() - cache.at > TTL) {
    inflight ??= refresh().finally(() => (inflight = null));
    await inflight;
  }
  if (cache && Date.now() - cache.at <= STALE_OK)
    return cache.prices[s] ?? null;
  return null;
}

export interface Quote {
  rate: number;
  /** Units of the asset to send for the USD amount. */
  cryptoAmount: number;
}

export async function quote(
  symbol: string,
  usd: number,
): Promise<Quote | null> {
  const rate = await getUsdPrice(symbol);
  if (!rate) return null;
  return { rate, cryptoAmount: roundCrypto(symbol, usd / rate) };
}

/** Decimal places that suit the asset: stablecoins 2, large coins 8, everything else 6. */
function decimals(symbol: string) {
  const s = symbol.toUpperCase();
  if (STABLE.has(s)) return 2;
  if (s === "BTC" || s === "LTC" || s === "BCH" || s === "ETH") return 8;
  return 6;
}

export const roundCrypto = (symbol: string, n: number) => {
  const d = decimals(symbol);
  return Math.ceil(n * 10 ** d) / 10 ** d; // round up so the user never sends slightly too little
};

export const formatCrypto = (symbol: string, n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: STABLE.has(symbol.toUpperCase()) ? 2 : 0, maximumFractionDigits: decimals(symbol) })} ${symbol.toUpperCase()}`;

export const hasLogo = (symbol: string) => Boolean(coinLogo(symbol));
