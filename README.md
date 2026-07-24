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
| ML Signal Model | Learned classifier predicts P(price rises) | Any (when it beats chance) |

The "AI" is deliberately **transparent and deterministic** — adaptive,
data-driven *selection* between audited strategies. No opaque model and no
self-modifying code decides your trades.

## Self-improvement ("AI Lab")

An adjacent engine continuously tries to make the strategies better — safely.
Each cycle (default hourly, plus an on-demand **Run analysis now** button):

1. **Re-optimizes parameters (walk-forward).** For every strategy it searches
   the parameter space on a *training* window, then validates the winner on a
   held-out *test* window the search never saw. A candidate is only trusted if
   it beats the current params **out-of-sample** with enough trades — the exact
   overfitting trap that sinks naive auto-tuners.
2. **Reviews the code + trades with AI** (optional, needs `ANTHROPIC_API_KEY`).
   Claude reads the strategy source and recent trades and returns a plain-English
   diagnosis plus concrete, code-level improvement ideas.

Everything surfaces as **proposals** on the AI Lab tab, with the out-of-sample
evidence shown. How much applies automatically is your call, set by the
**autonomy** level:

| Autonomy | Parameter tweaks | Code changes |
| --- | --- | --- |
| `propose_only` | wait for your Apply | review-only |
| `auto_tune_paper` (default) | auto-apply **in paper mode** | review-only |
| `full_auto` | auto-apply in any mode | review-only |

**Code-level changes are always review-only**, in every mode — the AI proposes,
you decide. The system never silently rewrites its own live-trading code. Only
bounded, audited, out-of-sample-validated *parameters* ever change on their own,
and you can reset any strategy to its defaults with one click.

## Signal generation (the ML model)

Beyond the hand-written strategies, the platform ships a **trainable ML model
that generates buy/sell signals itself** — the "ML Signal Model" strategy.

- **What it is.** A logistic-regression classifier over engineered market
  features (RSI, moving-average ratios, momentum, volatility, range position).
  It learns from history which feature combinations tend to precede a price
  rise, then trades on its predicted probability. Because it's linear, the
  learned weight on each feature is directly readable as that feature's
  importance — shown as bars in the AI Lab.
- **It keeps learning.** It retrains on the latest data on startup, inside every
  self-improvement cycle, and on demand ("Retrain now").
- **It's honest, and it won't trade on noise.** It reports **out-of-sample
  validation accuracy** (trained on older bars, measured on newer bars it never
  saw), not just optimistic in-sample accuracy. And it **refuses to trade unless
  that validation accuracy beats a floor above 50%** — a model that's only
  guessing produces no signals and stays flat.

> Reality check: on real markets, short-horizon direction is genuinely close to
> a coin flip. Expect the *edge over baseline* to be small. The tradable gate
> exists precisely so an unconvincing model can't put money at risk.

To use it, select **ML Signal Model** as your strategy, or leave AI auto-select
on and let the selector choose it when it's earning its keep.

### Training on real market data (`npm run train`)

Out of the box the model trains on the runtime feed. To *mature* it, train on
years of real history from free public data (no API key):

```bash
npm run train                                  # BTC/USD, hourly, ~2 years
npm run train -- --symbol ETH/USD --bars 26000 # more/other data
npm run train -- --refresh                     # force a fresh download
```

This downloads real OHLCV (Binance, falling back to CryptoCompare), trains, and
**saves the model to disk** (`data/ml-model.json`). The app loads that mature
model on startup and won't overwrite it with light live-feed retraining.

The pipeline uses techniques from the quant-ML literature to stay honest:

- **Triple-barrier labeling** (López de Prado) — labels a bar by whether a
  volatility-scaled profit target is hit before a stop within a horizon, rather
  than a naive "is it higher N bars later?".
- **Purged, embargoed walk-forward cross-validation** — the reported accuracy is
  out-of-sample with future-leakage removed around each fold boundary.
- **Majority-class baseline gate** — the model must beat "always predict the
  majority" by a margin, so a one-sided market can't fake an edge.
- **Richer features** — MACD-style EMA spread, Bollinger %b, ATR, and volume,
  on top of returns / RSI / momentum / range position.

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
  ai/
    optimizer.ts        Walk-forward parameter optimization
    analyst.ts          Claude API code/trade review (optional)
    improver.ts         Self-improvement loop + autonomy gating
  ml/
    dataSource.ts       Real historical OHLCV downloader (Binance/CryptoCompare)
    features.ts         Market feature engineering
    labeling.ts         Triple-barrier labeling
    cv.ts               Purged walk-forward cross-validation
    logistic.ts         Logistic-regression classifier (train/predict)
    signalModel.ts      Trainable signal model (learns, validates, predicts)
    train.ts            `npm run train` CLI — train on real data, save model
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
| GET | `/api/improve/params` | Live strategy parameters |
| GET | `/api/improve/proposals` | Improvement proposals + AI diagnosis |
| POST | `/api/improve/run` | Run an improvement cycle now |
| POST | `/api/improve/proposals/:id/apply\|reject` | Act on a proposal |
| POST | `/api/improve/params/:id/reset` | Reset a strategy to defaults |
| GET | `/api/ml/status` | ML model accuracy + feature importances |
| POST | `/api/ml/train` | Retrain the ML signal model now |
