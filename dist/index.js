/**
 * Crypto Market Sentiment — Agent Service
 * Fear & Greed index + funding rates + market cap via free APIs.
 * Entry points: sentiment (paid), funding (paid), health (free).
 */
import { z } from "zod";
import { createAgentApp } from "@lucid-dreams/agent-kit";
// ── Caches (60s) ──
let fngCache = null;
let fngCacheAt = 0;
let fundingCache = {};
let fundingCacheAt = 0;
let marketCache = null;
let marketCacheAt = 0;
const CACHE_TTL = 60_000;
export function resetCaches() {
    fngCache = null;
    fngCacheAt = 0;
    fundingCache = {};
    fundingCacheAt = 0;
    marketCache = null;
    marketCacheAt = 0;
}
// ── Fear & Greed ──
export async function getFearGreed(fetchFn = fetch) {
    const now = Date.now();
    if (fngCache && now - fngCacheAt < CACHE_TTL)
        return fngCache;
    try {
        const res = await fetchFn("https://api.alternative.me/fng/?limit=1");
        if (!res.ok)
            return fngCache ?? null;
        const data = await res.json();
        const entry = data?.data?.[0];
        if (!entry)
            return null;
        fngCache = {
            value: parseInt(entry.value, 10),
            classification: entry.value_classification,
            timestamp: parseInt(entry.timestamp, 10) * 1000,
        };
        fngCacheAt = now;
        return fngCache;
    }
    catch {
        return fngCache ?? null;
    }
}
// ── Funding rate (Binance USDT perps) ──
export async function getFundingRate(symbol, fetchFn = fetch) {
    const now = Date.now();
    const key = symbol.toUpperCase();
    if (fundingCache[key] && now - fundingCacheAt < CACHE_TTL)
        return fundingCache[key];
    try {
        const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${key}USDT&limit=1`;
        const res = await fetchFn(url);
        if (!res.ok)
            return fundingCache[key] ?? null;
        const data = await res.json();
        const entry = data?.[0];
        if (!entry)
            return null;
        const result = {
            symbol: key,
            fundingRate: parseFloat(entry.fundingRate),
            markPrice: parseFloat(entry.markPrice),
            time: entry.fundingTime,
        };
        fundingCache[key] = result;
        fundingCacheAt = now;
        return result;
    }
    catch {
        return fundingCache[key] ?? null;
    }
}
// ── Global market metrics ──
export async function getMarketMetrics(fetchFn = fetch) {
    const now = Date.now();
    if (marketCache && now - marketCacheAt < CACHE_TTL)
        return marketCache;
    try {
        const res = await fetchFn("https://api.coingecko.com/api/v3/global");
        if (!res.ok)
            return marketCache ?? null;
        const data = await res.json();
        const d = data?.data;
        if (!d)
            return null;
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
    }
    catch {
        return marketCache ?? null;
    }
}
// ── Agent App ──
const { app, addEntrypoint } = createAgentApp({
    name: "crypto-market-sentiment",
    version: "1.0.0",
    description: "Crypto market sentiment: Fear & Greed index, perp funding rates, global market metrics.",
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
    async handler({ input }) {
        const funding = await getFundingRate(input.symbol);
        return {
            output: {
                funding: funding,
                interpretation: funding === null
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
app.get("/.well-known/x402.json", (c) => c.json({
    name: "crypto-market-sentiment",
    description: "Crypto market sentiment: Fear & Greed index, perp funding rates, global market metrics.",
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
}));
// OpenAPI discovery
app.get("/openapi.json", (c) => {
    const spec = {
        openapi: "3.0.3",
        info: { title: "Crypto Market Sentiment", version: "1.0.0" },
        servers: [{ url: "https://crypto-market-sentiment.vercel.app" }],
        paths: {
            "/entrypoints/sentiment/invoke": {
                post: {
                    summary: "Fear & Greed index + global market metrics",
                    requestBody: { content: { "application/json": { schema: { type: "object" } } } },
                    responses: { "200": { description: "Sentiment data" }, "402": { description: "x402 payment required" } },
                },
            },
            "/entrypoints/funding/invoke": {
                post: {
                    summary: "Perp funding rates (Binance USDT)",
                    requestBody: { content: { "application/json": { schema: { type: "object" } } } },
                    responses: { "200": { description: "Funding rates" }, "402": { description: "x402 payment required" } },
                },
            },
        },
    };
    return c.json(spec);
});
// LLM discovery (llms.txt standard)
app.get("/llms.txt", (c) => c.text(`# Crypto Market Sentiment
> crypto-market-sentiment.vercel.app

Fear & Greed index, perp funding rates (Binance USDT), and global market metrics for AI agents. 60s caching.

## Endpoints (x402, USDC on Base)

- POST /entrypoints/sentiment/invoke — input: {} — $0.001/call — returns {fear_greed: {value, classification}, market: {total_market_cap_usd, btc_dominance}}
- POST /entrypoints/funding/invoke — input: {"symbol":"BTC"} — $0.001/call — returns {funding: {fundingRate, markPrice}, interpretation}
- POST /entrypoints/health/invoke — free

## Payment (x402)

1. POST → 402 with payment requirements (payTo, maxAmountRequired, asset)
2. Pay USDC on Base, attach X-PAYMENT header
3. Retry → JSON

No API keys, no signup. Discovery: /.well-known/x402.json
`));
export default app;
