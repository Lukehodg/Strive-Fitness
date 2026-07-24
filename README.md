# Auto-Trader — Personal AI Trading Platform

A simple, single-user automated crypto trading platform. It runs proven
trading strategies on a loop, uses an **AI selector** to pick the best strategy
for current market conditions, and shows everything on one dashboard.

> ⚠️ **Trading involves real financial risk.** This tool defaults to **paper
> trading** (simulated money) on purpose. Automated strategies that look great
> on historical data routinely lose money live. Prove a configuration out on
> paper for weeks before you even consider real money. Nothing here is
> financial advice.

## Quick start (zero config)

```bash
npm install
npm run dev
```

Open <http://localhost:5000> and press **Start**. With no API keys the platform
runs on **synthetic market data** and a **simulated broker**, so you can watch
the whole system work end-to-end with zero setup and zero risk.

## How it works

Each tick (every `intervalSeconds`), the engine:

1. **Pulls market data** — real Alpaca crypto bars if keys are set, otherwise a
   synthetic price series.
2. **Selects a strategy** (when auto-select is on) — it classifies the market
   *regime* (trending / ranging / volatile), backtests every strategy on the
   recent window, and picks the best risk-adjusted fit. Every switch is logged
   with a plain-English reason.
3. **Gets a signal** from the active strategy.
4. **Runs risk checks** — position sizing, a daily-loss kill-switch, and an
   order-rate limit. These are hard limits no strategy or AI decision can
   bypass.
5. **Places the order** through the active broker (paper or live) and records
   the trade.

### Built-in strategies

| Strategy | Idea | Best in |
| --- | --- | --- |
| SMA Trend Following | Fast/slow moving-average crossover | Trending markets |
| RSI Mean Reversion | Buy oversold, sell recovered | Ranging markets |
| Breakout Momentum | Enter on N-bar highs, exit on N-bar lows | Trends / volatility |

The "AI" is deliberately **transparent and deterministic** — adaptive,
data-driven *selection* between audited strategies. No opaque model and no
self-modifying code decides your trades.

## Risk controls (always on)

- **Max position size** — a cap on the fraction of equity per trade.
- **Daily-loss kill-switch** — halts all new entries if the account drops past
  your daily limit; clears at the next trading day or on manual Resume.
- **Per-trade stop-loss / take-profit**.
- **Order-rate limit** — at most a few orders per minute.

## Going live (real money)

Live trading is a first-class mode, but off until *you* turn it on:

1. Create an [Alpaca](https://alpaca.markets) account and generate API keys.
2. Set environment variables (see `.env.example`):
   ```
   ALPACA_KEY_ID=...
   ALPACA_SECRET_KEY=...
   ALPACA_BASE_URL=https://paper-api.alpaca.markets   # paper endpoint
   ```
   Use Alpaca's **paper** endpoint first — same API, fake money on their side.
   Switch `ALPACA_BASE_URL` to the live endpoint only when you're ready.
3. In **Settings**, flip **Live trading** on. The server refuses live mode
   unless keys are present.

## Architecture

```
server/
  index.ts              Express bootstrap (unchanged infra)
  routes.ts             REST API
  storage.ts            In-memory store (no DB required)
  trading/
    indicators.ts       SMA / EMA / RSI / ATR ...
    strategies.ts       Strategy library + registry
    brokers.ts          Broker interface, PaperBroker, AlpacaBroker
    marketData.ts       Alpaca bars + synthetic fallback
    backtester.ts       Replays strategies over history
    aiSelector.ts       Regime detection + strategy ranking
    riskManager.ts      Hard risk limits
    engine.ts           The orchestration loop
client/
  src/pages/dashboard.tsx   Single-page dashboard
  src/lib/api.ts            Typed API client
shared/
  schema.ts             Domain types shared by client + server
```

State is in-memory by design (a personal tool needs no database). Restarting
the server resets paper balances and history.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Engine status, mode, active strategy, regime |
| GET | `/api/equity` | Equity curve points |
| GET | `/api/position` | Current open position |
| GET | `/api/trades` | Completed trades |
| GET | `/api/performance` | Win rate, P&L, drawdown |
| GET | `/api/decisions` | Audit log |
| GET | `/api/backtest` | Rank strategies on recent data |
| GET | `/api/recommendation` | What the AI selector would pick now |
| GET/PATCH | `/api/config` | Read / update settings |
| POST | `/api/control/start\|stop\|resume` | Engine controls |
