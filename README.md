# Crypto Market Sentiment

Pay-per-call x402 agent service: Fear & Greed index, perp funding rates, and global market metrics for AI agents.

## Endpoints

| Entrypoint | Description | Price |
|---|---|---|
| `sentiment` | Fear & Greed index + global market metrics (cap, volume, BTC dominance) | $0.001/call |
| `funding` | Perp funding rate for a symbol (Binance USDT) | $0.001/call |
| `health` | Service status | free |

## Usage

```bash
# Discover (402 with payment requirements)
curl -X POST https://crypto-market-sentiment.vercel.app/entrypoints/sentiment/invoke \
  -H 'content-type: application/json' -d '{"input":{}}'

# Pay USDC (Base) then retry with X-PAYMENT header
curl -X POST https://crypto-market-sentiment.vercel.app/entrypoints/funding/invoke \
  -H 'content-type: application/json' \
  -H 'X-PAYMENT: <payment-payload>' \
  -d '{"input":{"symbol":"BTC"}}'
```

## Response (sentiment)

```json
{
  "output": {
    "fear_greed": {
      "value": 25,
      "classification": "Extreme Fear",
      "timestamp": 1785801600000
    },
    "market": {
      "active_cryptocurrencies": 18118,
      "total_market_cap_usd": 2500000000000,
      "btc_dominance": 55.5
    }
  }
}
```

## Data sources

- Fear & Greed: alternative.me (free API)
- Funding rates: Binance USDT perp futures
- Market metrics: CoinGecko global

## Tech stack

TypeScript · Hono · @lucid-dreams/agent-kit · x402 · Vercel

## Test

```bash
npm install
npm run test   # 10 vitest tests
```

## Funding

[.FUNDING.yml](.FUNDING.yml) — contributions and tips welcome.
