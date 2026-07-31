# Auto-Trader — Personal AI Trading Platform

A simple, single-user automated crypto trading platform. It runs proven
trading strategies on a loop, uses an **AI selector** to pick the best strategy
for current market conditions, and shows everything on one dashboard.

> ⚠️ **Trading involves real financial risk.** This tool defaults to **paper
> trading** (simulated money) on purpose. Automated strategies that look great
> on historical data routinely lose money live. Prove a configuration out on
> paper for weeks before you even consider real money. Nothing here is
> financial advice.

## Two engines

Strive has two interchangeable trading engines:

- **Built-in (this app)** — a lightweight, zero-setup TypeScript engine with its
  own dashboard, AI strategy selection, self-improvement loop, and ML signal
  model. Great for exploring and running instantly.
- **Freqtrade** (`freqtrade/`) — a mature, production crypto bot (real exchange
  execution, backtesting, hyperopt, and the **FreqAI** ML pipeline) wired up
  with our strategies and a rich, Qlib-style feature set. Recommended for
  anything approaching real money. See [`freqtrade/README.md`](freqtrade/README.md).

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

### A known limitation of auto-selection

Auto-selection scores every strategy by backtesting it on the *same* recent
window it is about to trade forward from. That is **in-sample selection**, and
over a few hundred bars the score differences are largely noise.

Measured over 8 independent simulated months, auto-selection finished roughly
**5-6 percentage points behind simply holding the best single strategy** — and
no setting fixed it:

| reselect interval | switch margin | median month | switches/month | max DD |
|---|---|---|---|---|
| 5 min | 0 (old default) | 10.91% | 1,156 | 2.35% |
| 15 min | 8 | 11.73% | 177 | 1.97% |
| **30 min** | **8 (current)** | **11.22%** | **145** | **1.87%** |
| 60 min | 15 | 11.42% | 11 | 2.83% |

Hysteresis (`SWITCH_MARGIN` in `aiSelector.ts`) cuts churn ~8x and lowers
drawdown, which is a real gain — but it does **not** close the performance gap.
The gap is structural: picking the recent in-sample winner chases noise. Fixing
it properly means selecting on *out-of-sample* evidence, the way `ai/optimizer.ts`
already does for parameters. Until then, treat auto-selection as a convenience,
not an edge — and consider fixing a single strategy in Settings.

Those numbers come from synthetic data with strong built-in momentum, so they
flatter trend-following strategies specifically; the ~5-6pp shortfall is the
durable finding, not the individual returns.

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

Every candidate improvement must also survive a **backtest-integrity audit**
(after Bailey & López de Prado — see
[How-To-Backtest-Correctly](https://github.com/Neyt/How-To-Backtest-Correctly)):

- **PBO (Probability of Backtest Overfitting)** via combinatorially symmetric
  cross-validation: instead of one walk-forward path, every candidate is scored
  across all C(8,4)=70 train/test group combinations, measuring how often the
  in-sample winner ranks *below median* out-of-sample. **PBO > 5% ⇒ rejected**
  as presumed overfit (rejections are logged so you can see the gate working).
- **Deflated Sharpe Ratio (DSR)**: each Sharpe is measured against the Sharpe
  the *best of N trials* would reach by pure luck — the multiple-testing
  correction. ~50% = indistinguishable from the luckiest random trial. Shown
  per strategy on the Strategies tab and on proposals.
- **Embargo** between train/test windows, and **slippage** (on top of fees) in
  every backtest fill.

Expect proposals to be *rare* — that's the point. Most "improvements" found by
searching parameters are luck, and the audit now says so out loud.

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

## Execution & sizing — the highest-certainty way to raise net returns

Better signals are a gamble. **Not overpaying for execution and sizing by
statistics instead of gut feel are not** — they're free money left on the
table by most DIY trading bots, and they're on by default here.

- **Maker-first limit orders.** Instead of always crossing the spread with a
  market order, entries and take-profit exits post a resting limit order
  slightly through the current price (`limitOrderOffsetPct`, default 0.06%).
  If the range of the bar the order **rests in** reaches it, you pay a maker
  fee (0.02%) with **no added slippage** instead of a taker fee (0.10%) plus
  slippage — roughly an 80%+ cut in per-trade cost. Entries that don't fill
  are simply skipped (no urgency; the strategy re-evaluates next tick). Exits
  always guarantee a fill — if the maker order doesn't touch, it falls back
  to a market order rather than leaving you stuck in a position.
  **Stop-losses always fill immediately**, full taker, no delay — a stop that
  waits for a better price is how a bounded loss becomes an unbounded one.
- **Resting orders settle on the *next* bar — never their own.** A limit
  order priced off a bar's close cannot be filled by that same bar: it has
  already closed, so its high/low are known, and "filling" against them is
  lookahead bias. Doing so hands every trade a risk-free improvement on both
  entry and exit; measured on drift-neutral data, that fabricated ~0.12% per
  round trip turned a losing strategy into a reliable +20%/month mirage. Both
  the backtester and the paper broker therefore leave limit orders genuinely
  **resting**, and settle them only against the bar that elapses afterwards.
  `npm run check:execution` asserts this invariant.
- **Volatility-targeted sizing.** Position size scales down when the market
  is choppier than your `volTargetPct` and up (toward, never past, your max
  position size) when it's calmer — so realized risk per trade stays roughly
  constant instead of swinging with whatever the market happens to be doing.
- **Fractional Kelly.** Once a strategy has 10+ trades of its own track
  record, position size is further scaled by its actual win-rate/payoff
  ratio via the Kelly criterion, discounted to a fraction (`kellyFraction`,
  default 0.5 = half-Kelly — full Kelly is famously aggressive and brutally
  sensitive to estimation error). A strategy that's been losing gets sized
  down automatically; one that's been winning gets sized up — bounded the
  same way volatility targeting is.
- **Both are hard-bounded.** Neither adjustment can ever push a position past
  your configured max position size — they only redistribute risk *within*
  the ceiling you already set.
- **What you see is what you'd get.** The Strategies tab and the
  self-improvement optimizer's accept/reject decisions now use this same
  realistic sizing and execution model — not a disconnected, unrealistically
  large flat-sizing backtest. (One historical inconsistency this fixed: the
  backtester previously deployed ~95% of cash on every trade regardless of
  your actual risk settings, so the numbers shown and the numbers the
  optimizer acted on didn't describe what live trading would actually do.)

## Persistence, alerts, and the watchdog

- **State survives restarts.** Trades, equity history, decision log, proposals,
  alerts, tuned strategy parameters, and the paper broker's balance/positions
  are snapshotted to `data/state.json` (debounced, atomic writes; flushed on
  shutdown) and restored on boot. Delete `data/` for a fresh start.
- **Alerts.** Fills, kill-switch trips, auto-applied tunes, live-mode
  activation, and engine stalls raise alerts — shown as a banner in the UI
  (with acknowledge) and, if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are set,
  pushed to your phone via Telegram.
- **Watchdog.** If the engine claims to be running but stops completing ticks,
  a critical "engine stalled" alert fires (and a recovery notice when it
  resumes).
- **Model registry.** Every model saved by `npm run train` is recorded in
  `data/model-registry.json` (`GET /api/ml/registry`) — an audit trail of what
  was trained on what data, with what validation accuracy.

## Meta-labeling (bet sizing)

On top of the primary ML signal, a **meta-model** (López de Prado's
meta-labeling) learns to predict whether each signal is *correct* — trained
only on genuinely out-of-fold primary predictions, so it can't inherit the
primary model's in-sample overconfidence. At runtime it **vetoes weak signals**
and its confidence **sizes the bets** that pass (the risk manager scales the
position accordingly). The AI Lab shows its accuracy and what fraction of
signals it approves.

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

## Performance

The hot paths (backtesting, ML feature/label extraction, the walk-forward
optimizer, the PBO overfitting audit) were profiled and fixed for algorithmic
complexity, not micro-optimized — every change below removed accidental
O(n²) or O(n) behavior that had no effect on the platform's decisions, and
each one was verified byte-identical (or numerically negligible, for
recursive filters like EMA/RSI) against the old implementation on randomized
inputs before being trusted:

- **`indicators.ts` — `atr()`**: computed true range over the *entire* input
  history on every call, then discarded all but the last `period` values.
  Now O(period). Verified identical across 200 randomized trials.
- **`backtester.ts` / `ml/features.ts`**: both re-sliced candles from index 0
  on every bar (`candles.slice(0, i+1)`), so a backtest over N bars did O(n²)
  work. Both now use a bounded `INDICATOR_LOOKBACK_WINDOW` (300 bars) —
  enough for every indicator in the app to settle (EMA(26), RSI(14),
  SMA(80)) with a verified ~1e-10 relative difference from unbounded
  history. Verified via 44 old-vs-new A/B backtests across multiple series
  lengths, seeds, and strategies — all identical.
- **`ml/labeling.ts` — `tripleBarrierLabel()`**: mapped the *entire* candle
  array to closes on every call, and `buildDataset` calls it once per bar —
  another accidental O(n²). This was the single biggest win: building a
  training dataset from 17,520 hourly candles (~2 years) dropped from
  **14.9s to 0.36s (~42x)**. Verified identical across 6,000 randomized
  comparisons.
- **`ai/optimizer.ts`**: eliminated one redundant full backtest per
  optimization run (the winning candidate's in-sample score was being
  recomputed after the search loop instead of reused).
- **`ai/cscv.ts` (PBO/CSCV)**: the naive implementation re-sliced and
  re-scanned every candidate's raw returns for each of the ~70 combinatorial
  train/test splits. Now precomputes each (config, group) sum/sum-of-squares
  once and combines those aggregates per split — O(configs × bars) instead
  of O(splits × configs × bars). Verified identical across 25 randomized
  matrices.
- **`marketData.ts`**: added a short-lived (3s) shared cache for
  `getCandles(symbol, count)`, keyed across all `MarketFeed` instances (the
  engine, the improver, and API routes each create their own). Dedupes
  near-simultaneous calls — e.g. a dashboard poll landing in the same second
  as an engine tick — without ever delaying the live engine's reaction to
  genuinely fresh data (TTL is shorter than the engine's 5s minimum tick
  interval).

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
    sizing.ts           Volatility-targeted + fractional-Kelly position sizing
    execution.ts        Maker-first limit order / fill simulation
    engine.ts           The orchestration loop
  ai/
    optimizer.ts        Walk-forward parameter optimization (+ PBO/DSR gate)
    metrics.ts          Sharpe, Probabilistic/Deflated Sharpe, MinTRL
    cscv.ts             Probability of Backtest Overfitting (CSCV)
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
