/**
 * Crypto Market Sentiment — Agent Service
 * Fear & Greed index + funding rates + market cap via free APIs.
 * Entry points: sentiment (paid), funding (paid), health (free).
 */

import { z } from "zod";
import { createAgentApp } from "@lucid-dreams/agent-kit";

// ── Caches (60s) ──
let fngCache: any = null;
let fngCacheAt = 0;
let fundingCache: Record<string, any> = {};
let fundingCacheAt = 0;
let marketCache: any = null;
let marketCacheAt = 0;
const CACHE_TTL = 60_000;

export function resetCaches(): void {
  fngCache = null;
  fngCacheAt = 0;
  fundingCache = {};
  fundingCacheAt = 0;
  marketCache = null;
  marketCacheAt = 0;
}

// ── Fear & Greed ──
export async function getFearGreed(
  fetchFn: typeof fetch = fetch,
): Promise<{ value: number; classification: string; timestamp: number } | null> {
  const now = Date.now();
  if (fngCache && now - fngCacheAt < CACHE_TTL) return fngCache;
  try {
    const res = await fetchFn("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return fngCache ?? null;
    const data: any = await res.json();
    const entry = data?.data?.[0];
    if (!entry) return null;
    fngCache = {
      value: parseInt(entry.value, 10),
      classification: entry.value_classification,
      timestamp: parseInt(entry.timestamp, 10) * 1000,
    };
    fngCacheAt = now;
    return fngCache;
  } catch {
    return fngCache ?? null;
  }
}

// ── Funding rate (Binance USDT perps) ──
export async function getFundingRate(
  symbol: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ symbol: string; fundingRate: number; markPrice: number; time: number } | null> {
  const now = Date.now();
  const key = symbol.toUpperCase();
  if (fundingCache[key] && now - fundingCacheAt < CACHE_TTL) return fundingCache[key];
  try {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${key}USDT&limit=1`;
    const res = await fetchFn(url);
    if (!res.ok) return fundingCache[key] ?? null;
    const data: any = await res.json();
    const entry = data?.[0];
    if (!entry) return null;
    const result = {
      symbol: key,
      fundingRate: parseFloat(entry.fundingRate),
      markPrice: parseFloat(entry.markPrice),
      time: entry.fundingTime,
    };
    fundingCache[key] = result;
    fundingCacheAt = now;
    return result;
  } catch {
    return fundingCache[key] ?? null;
  }
}

// ── Global market metrics ──
export async function getMarketMetrics(
  fetchFn: typeof fetch = fetch,
): Promise<Record<string, any> | null> {
  const now = Date.now();
  if (marketCache && now - marketCacheAt < CACHE_TTL) return marketCache;
  try {
    const res = await fetchFn("https://api.coingecko.com/api/v3/global");
    if (!res.ok) return marketCache ?? null;
    const data: any = await res.json();
    const d = data?.data;
    if (!d) return null;
    marketCache = {
      active_cryptocurrencies: d.active_cryptocurrencies,
      markets: d.markets,
      total_market_cap_usd: d.total_market_cap?.usd,
      total_volume_usd: d.total_volume?.usd,
      btc_dominance: d.market_cap_percentage?.btc,
      eth_dominance: d.market_cap_percentage?.eth,
    };
    marketCacheAt = now;
    return marketCache;
  } catch {
    return marketCache ?? null;
  }
}

// ── Agent App ──
const { app, addEntrypoint }: { app: any; addEntrypoint: any } =
  createAgentApp({
    name: "crypto-market-sentiment",
    version: "1.0.0",
    description:
      "Crypto market sentiment: Fear & Greed index, perp funding rates, global market metrics.",
  });

addEntrypoint({
  key: "sentiment",
  description: "Fear & Greed index + global market metrics",
  price: process.env.DEFAULT_PRICE ?? "0.001",
  input: z.object({}),
  async handler() {
    const fng = await getFearGreed();
    const market = await getMarketMetrics();
    return {
      output: {
        fear_greed: fng,
        market: market,
      },
    };
  },
});

addEntrypoint({
  key: "funding",
  description: "Perp funding rate for a symbol (Binance USDT)",
  price: process.env.DEFAULT_PRICE ?? "0.001",
  input: z.object({
    symbol: z.string().min(1).max(12).describe("Base symbol: BTC, ETH, SOL..."),
  }),
  async handler({ input }: { input: any }) {
    const funding = await getFundingRate(input.symbol);
    return {
      output: {
        funding: funding,
        interpretation:
          funding === null
            ? "unknown symbol"
            : funding.fundingRate > 0
              ? "longs pay shorts (bullish bias)"
              : "shorts pay longs (bearish bias)",
      },
    };
  },
});

addEntrypoint({
  key: "health",
  description: "Health check",
  input: z.object({}),
  async handler() {
    return {
      output: {
        ok: true,
        timestamp: new Date().toISOString(),
        endpoints: ["sentiment", "funding"],
      },
    };
  },
});

app.get("/.well-known/x402.json", (c: any) =>
  c.json({
    name: "crypto-market-sentiment",
    description:
      "Crypto market sentiment: Fear & Greed index, perp funding rates, global market metrics.",
    version: "1.0.0",
    payTo: process.env.ADDRESS ?? "",
    network: "base",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base mainnet
    endpoints: [
      {
        key: "sentiment",
        path: "/entrypoints/sentiment/invoke",
        method: "POST",
        price: process.env.DEFAULT_PRICE ?? "0.001",
        description: "Fear & Greed index + global market metrics",
      },
      {
        key: "funding",
        path: "/entrypoints/funding/invoke",
        method: "POST",
        price: process.env.DEFAULT_PRICE ?? "0.001",
        description: "Perp funding rate for a symbol",
      },
      {
        key: "health",
        path: "/entrypoints/health/invoke",
        method: "POST",
        price: "0",
        description: "Health check",
      },
    ],
  }),
);

export default app;
