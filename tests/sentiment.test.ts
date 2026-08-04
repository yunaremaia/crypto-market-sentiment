import { describe, it, expect, vi, beforeEach } from "vitest";
import app, {
  getFearGreed,
  getFundingRate,
  getMarketMetrics,
  resetCaches,
} from "../src/index.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("getFearGreed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCaches();
  });

  it("parses FNG response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ value: "25", value_classification: "Extreme Fear", timestamp: "1785801600" }],
      }),
    });
    const result = await getFearGreed(mockFetch);
    expect(result).toEqual({
      value: 25,
      classification: "Extreme Fear",
      timestamp: 1785801600000,
    });
  });

  it("caches within TTL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ value: "50", value_classification: "Neutral", timestamp: "1785801600" }],
      }),
    });
    await getFearGreed(mockFetch);
    await getFearGreed(mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null on error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    const result = await getFearGreed(mockFetch);
    expect(result).toBeNull();
  });
});

describe("getFundingRate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCaches();
  });

  it("parses Binance funding response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { symbol: "BTCUSDT", fundingTime: 1785859200000, fundingRate: "0.00007684", markPrice: "64093.54" },
      ],
    });
    const result = await getFundingRate("BTC", mockFetch);
    expect(result).toEqual({
      symbol: "BTC",
      fundingRate: 0.00007684,
      markPrice: 64093.54,
      time: 1785859200000,
    });
    expect(mockFetch.mock.calls[0][0]).toContain("BTCUSDT");
  });

  it("caches per-symbol", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { symbol: "ETHUSDT", fundingTime: 1, fundingRate: "0.0001", markPrice: "3200" },
      ],
    });
    await getFundingRate("ETH", mockFetch);
    await getFundingRate("ETH", mockFetch);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("getMarketMetrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCaches();
  });

  it("parses CoinGecko global", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          active_cryptocurrencies: 18118,
          markets: 1510,
          total_market_cap: { usd: 2500000000000 },
          total_volume: { usd: 80000000000 },
          market_cap_percentage: { btc: 55.5, eth: 15.2 },
        },
      }),
    });
    const result = await getMarketMetrics(mockFetch);
    expect(result?.active_cryptocurrencies).toBe(18118);
    expect(result?.btc_dominance).toBe(55.5);
  });
});

describe("Agent entrypoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetCaches();
  });

  it("/health returns 200", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("exposes entrypoints", async () => {
    const res = await app.request("/entrypoints");
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: any) => i.key)).toContain("sentiment");
    expect(items.map((i: any) => i.key)).toContain("funding");
  });

  it("x402: sentiment invoke without payment → 402", async () => {
    const res = await app.request("/entrypoints/sentiment/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });
    expect(res.status).toBe(402);
    const body: any = await res.json();
    expect(body.error).toContain("X-PAYMENT");
    expect(body.accepts[0].payTo).toBeDefined();
  });

  it("x402: funding invoke without payment → 402", async () => {
    const res = await app.request("/entrypoints/funding/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { symbol: "BTC" } }),
    });
    expect(res.status).toBe(402);
  });
});
