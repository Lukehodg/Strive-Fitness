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

Those numbers come from synthetic data with strong built-in momentum, so they
flatter trend-following strategies specifically; the shortfall is the durable
finding, not the individual returns.

#### What the shortfall actually was — and the fix

The obvious diagnosis was the scoring: pick the in-sample winner, chase noise.
So the fix looked obvious too — score strategies out-of-sample instead.

**That was wrong, and measuring it is what showed why.**
`trading/selection.ts` implements consistency-across-sub-periods scoring with
shrinkage and a dispersion penalty. Measured against the existing selector on
20 independent walk-forward price paths, ranked on 10 and confirmed on 10
unseen ones:

- As first written it was **far worse** — 35.20% vs 67.92% (t = −4.90) — and
  switched 8 times per run against the incumbent's 2.4. More jittery, not less.
- Tuned as far as it would go, it drew **level and no further**: +0.39pp,
  t = 0.11.
- The sweep showed the scoring changes barely mattered. What dominated
  everything was **how often the engine switched**.

| `SWITCH_MARGIN` | validate return | switches per run |
|---|---|---|
| 4 (old default) | 83.90% | 2.9 |
| 8 | 88.25% | 0.9 |
| **12 (current)** | **92.61%** | **0.4** |
| 20 | 94.76% | 0.2 |
| 40 | 91.70% | 0.1 |

At margin 4 the selector trailed the best fixed strategy by **14.10pp
(t = −3.36, significant)**. At margin 20 that gap fell to **3.25pp (t = −1.08,
no longer distinguishable from noise)**.

**Most of what looked like bad strategy *choice* was churn.** The selector was
picking reasonably and then paying to change its mind.

Honesty about strength: differences between margins are directionally
consistent across both halves, but none individually clears significance (best
t = 1.83, needs 2.26). 12 was chosen as the conservative end of a 12–20 plateau
— don't read it as precisely optimal. What *is* well supported is that 4 was
the worst value tested, on both halves.

`selection.ts` is kept, unwired, as the record of the failed experiment.

Reproduce any of this:

```bash
npx tsx server/trading/selectionEval.ts    # policies vs fixed vs oracle
npx tsx server/trading/selectionSweep.ts   # settings, train/validate split
npx tsx server/trading/marginEval.ts       # the margin result above
```

Still true: auto-selection is not an *edge*. It is now roughly on par with
holding one good strategy rather than measurably behind it. Fixing a single
strategy in Settings (`autoSelectStrategy: false`) remains a defensible choice.

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

### News sentiment — built, measured, and NOT trading

`server/trading/news.ts` pulls headlines from Alpaca's news API (same keys, no
scraping, no terms-of-service problem) and scores them with a finance-specific
lexicon. `server/ml/newsFeatures.ts` turns that stream into four per-bar
features.

Alpaca was chosen over scraping for one reason that outweighs breadth: it has
**history**. Sentiment you can only observe live cannot be backtested, and a
signal you cannot backtest is a guess with extra steps.

**Nothing here sizes a trade until an ablation says it earns its place.**

```bash
npx tsx server/ml/newsAblation.ts              # self-test, no keys needed
npx tsx server/ml/newsAblation.ts AAPL 180     # real news, needs your keys
```

Same candles, same labels, same folds, same seed — the only difference is four
extra columns. Then a paired t-test across folds, because they are the same
folds. Adding a feature almost always raises *in-sample* accuracy; the only
question worth asking is whether it raises *out-of-sample* ranking by more than
the noise in the estimate.

The self-test validates the instrument before you trust its readings, on two
synthetic conditions with known answers: **noise** news must report no edge,
**planted** news must report a large one. A harness that can't detect a planted
edge is not evidence of absence, and one that finds an edge in pure noise is
worse than useless.

> **A negative verdict is the expected outcome and is worth having.** It means
> the feature stays out of the model instead of quietly adding variance.

Two things this exercise turned up that are worth knowing independently:

- **Accuracy is the wrong metric for this dataset.** The triple-barrier labels
  are ~70% positive and the model's out-of-fold probabilities span 0.564–0.822
  — it predicts "up" on 100% of samples and never crosses the 0.5 threshold.
  Its "70.21% accuracy" *is* the 70.10% base rate. The ablation uses AUC, which
  is rank-based and registers a better probability ordering even when every
  prediction stays on one side of the threshold. (The live model already
  refuses to trade this case — `isTradable()` requires accuracy to beat the
  majority-class baseline by a margin — but a metric that reads identically for
  a good model and a constant one can't answer an ablation.)
- **News features are hour-scale by design.** They read only headlines strictly
  *before* a bar opens. The naive join — bucket news by bar and attach it to
  that bar — puts price-moving news and the move it caused in the same bucket,
  so the model learns "big sentiment now = big move now", backtests brilliantly,
  and does nothing live.

### Why not a geopolitics scraper (FlightRadar, etc.)

The idea comes up and the instinct is sound, but the specific version doesn't
survive contact with the numbers. Military aircraft largely don't broadcast
ADS-B, and FlightRadar24 filters most of what does; scraping it violates their
terms in any case. The fatal problem is sample size: real geopolitical oil
shocks happen perhaps five or six times a decade, so any strategy built on them
is fitted to a handful of events. That is exactly what the confidence governor
above exists to distrust. The tractable version of the same instinct is the
event blackout below — knowing *when* things happen, which is verifiable —
plus news sentiment held to the ablation bar.

## Event blackouts (news, without pretending to predict it)

`server/trading/events.ts`. The bot will not open a position in the minutes
around a scheduled release. It makes **no prediction about what the release
will do** — that is the part nobody does reliably. It only declines to be
holding leverage through a print that routinely moves crude 3% in ninety
seconds. Not being in the trade is an edge you can verify; forecasting the
number is not.

Only entries are gated. Anything already open is left alone, because closing
into the same thin pre-release book is not obviously safer than holding with
the stop already sitting at the venue.

**Two sources of truth, deliberately separated:**

| | Events | Goes stale? |
|---|---|---|
| **Rule-derived** | Nonfarm payrolls (1st Friday, 08:30 ET), EIA petroleum (Wed 10:30 ET, slipping to Thursday after a Monday federal holiday), EIA natural gas (Thu 10:30 ET), quarterly triple witching | Never — computed from standing published schedules, including the federal holiday calendar |
| **Dated** | FOMC decisions, CPI prints, OPEC+ meetings | **Yes** — announced but not derivable, so they live in `server/data/eventCalendar.json` |

**The dated file ships empty on purpose.** Seeding it with guessed dates would
create blackout windows at the wrong times, which is worse than having none:
the bot would size up straight into a release it believed had already passed.
Until you paste the real dates in and push `validThrough` forward, the
dashboard reports the calendar as stale rather than quietly showing a clear
schedule. Sources are listed in the file's `note` field.

A medium-severity event gets half the configured window. Broad-market events
("all symbols") gate crypto too — a Fed decision moves BTC.

Settings: **Event blackout** on/off, and the before/after windows (default
30 min / 15 min).

## Risk controls (always on)

### Confidence governor

`server/trading/confidence.ts`. Position size already reacted to signal
strength, volatility and Kelly, but nothing looked at the state of the account
as a whole — a strategy can keep emitting strong signals while the book
quietly bleeds. This scores six **measured** things (sample size, realised win
rate, drawdown from peak, P&L against the day's open, regime fit, and
proximity to a scheduled release), multiplies your `maxPositionPct` by the
result, and stops opening positions below a 35% floor.

**It only ever scales down.** Your configured limits are a ceiling. Scaling
*up* on high confidence would require the score to be calibrated — for "90%"
to genuinely mean nine times in ten — and nothing here demonstrates that. An
overconfident multiplier applied to a negative expectancy is precisely how an
account dies, so the asymmetry is deliberate.

It also never shrinks below 25%: a governor that goes to zero can never
recover, because it would stop generating the trades it needs as evidence.

On a fresh account this means sizing starts around 40% of your maximum and
earns its way up as trades accumulate.

### Venue-side stop-losses (protection that survives a crash)

Engine-side stops only work while the engine is running. Close the laptop with
an open crypto position and nothing is watching it through a 24/7 market — the
3% stop simply does not exist until the app comes back.

So when an entry fills, a stop-loss is **parked at the broker**:

| | |
|---|---|
| Crypto | `stop_limit`, GTC (Alpaca has no plain `stop` for crypto) |
| Equities | `stop`, GTC |
| Limit price | 0.5% below the trigger, so it fills through a fast move |

Deliberately the **stop only**, not a bracket with a take-profit attached.
Alpaca does not support OCO/bracket for crypto, so a paired take-profit would
have to be managed by this process — and if it filled while the process was
down, the stop would be left live against a position that no longer exists.
Losing a take-profit to downtime costs upside; losing a stop costs money.

The engine's own stop check stays as a faster backstop when it is running, and
the venue stop is cancelled before any discretionary exit so it cannot fire
afterwards against a position that is already closed. If the broker rejects the
stop you get a `risk_block` entry and a warning alert — a position silently
running without protection is exactly what this feature exists to prevent.

This does **not** remove the need for an always-on host. It protects the
downside; it does not keep trading while you are away.


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

## Day trading vs swing trading

Two profiles set risk settings **and** strategy parameters together:

```bash
curl localhost:5000/api/profiles                      # see both
curl -X POST localhost:5000/api/profiles/day/apply    # switch
```

| | Swing (default) | Day trading |
|---|---|---|
| Overnight positions | allowed | **never** |
| Stop / take-profit | 3% / 6% | 1% / 1.5% |
| Max position | 25% | 10% |
| Poll interval | 30s | 15s |
| Orders/minute cap | 3 | 12 |
| MA lengths | 10 / 30 | 5 / 20 |
| Breakout lookback | 20 / 10 | 10 / 5 |

Parameters move **with** the risk settings, deliberately: day-trading stops
against swing-length lookbacks would stop out of every trend before it
resolved, so applying half a profile is worse than applying neither.

### How "never overnight" is enforced

Two deadlines, because the instruments differ:

- **Equities** are flattened `flatBeforeCloseMinutes` (15) before the bell,
  using the venue's own clock, and no new position opens within
  `noEntriesBeforeCloseMinutes` (30) of it — opening then just books a round
  trip's costs for something the flatten rule closes minutes later.
- **Crypto never closes**, so it is bounded by `maxHoldingMinutes` (240)
  instead. Applying only the session rule would leave crypto held forever;
  applying only the time cap would let a late equity entry straddle the bell.

Both are **forced taker exits** — a maker order waiting for a better price
defeats the purpose of a deadline.

The order-rate ceiling is part of the profile because it is a runaway-loop
guard, not a strategy setting. At the swing value of 3/min the engine spent
most ticks logging "order rate limit reached" once day trading turned over
more orders.

> **Day trading equities under $25k is not viable.** The Pattern Day Trader
> rule caps margin accounts under that at 3 day trades per 5 business days,
> and this profile is designed to exceed that immediately. Crypto is exempt.

> **More trades means more cost.** Fee drag already runs 1.5-3% of capital per
> month at swing frequency. This profile trades considerably more, against an
> edge that has not been demonstrated — every measurement so far says there
> isn't one yet. Prove it on paper first.

## Multi-symbol trading (the AI picks what to trade)

### Universe presets

```bash
curl localhost:5000/api/universes                        # list presets
curl -X POST localhost:5000/api/universes/everything/apply
```

| Preset | Symbols | Notes |
|---|---|---|
| `crypto` | 15 | 24/7, exempt from PDT — the only one viable on a small real account |
| `stocks` | 15 | Mega caps, market hours only |
| `etfs` | 10 | Index/sector ETFs, tighter spreads |
| `everything` | 40 | All of the above |

**A wide universe does not mean a big book.** The engine scans everything each
tick, but the portfolio limits still decide what it may hold — 3 concurrent
positions and 60% total exposure by default. Breadth buys *selection*, not
risk: more candidates to pick the best from.

Symbols are fetched with a bounded worker pool (8 in flight). Sequentially, 40
symbols at ~200ms each would take ~8s per tick and starve the loop; unbounded,
it would burst through Alpaca's ~200 requests/minute limit. Measured: 8023ms
sequential vs 1006ms at concurrency 8, peak 8 in flight. A failure on one
symbol is logged and skipped — it never aborts the tick.


Set `extraSymbols` and the engine trades a universe instead of one instrument.
Crypto and equities can be mixed freely — asset-class rules apply per symbol.

```bash
curl -X PATCH localhost:5000/api/config -H "Content-Type: application/json" \
  -d '{"symbol":"BTC/USD","extraSymbols":["ETH/USD","AAPL","NVDA"]}'
```

Each tick the engine now: prices every tradable symbol, **exits first** (freeing
capital and cutting losers takes priority over any new idea, and exits are never
blocked by the kill-switch), then ranks everything that is signalling by
conviction and fills the best first, so limited capital goes to the strongest
opportunity rather than whichever symbol sorts first.

### Portfolio limits — why per-trade caps are not enough

Five positions each inside the 25% per-trade cap is 125% of equity, and if they
are all crypto it is really *one* position with five sets of fees. So three
portfolio limits sit on top of the per-trade cap:

| Limit | Default | What it stops |
|---|---|---|
| `maxConcurrentPositions` | 3 | Death by a thousand small positions |
| `maxTotalExposurePct` | 0.60 | Aggregate leverage creeping past equity |
| `maxCorrelatedExposurePct` | 0.35 | **Diversification that isn't** |

The third is the one that matters. Holding BTC and ETH is close to holding
double BTC; naive diversification counts it as two independent bets. Exposure is
weighted by correlation against what you already hold, so a near-duplicate gets
throttled (in tests, a 0.95-correlated candidate is cut from $2,000 to $650)
while a genuinely uncorrelated one gets full size.

Correlation is used as an **absolute** value. A strongly negative correlation is
a real hedge for a long/short book, but this system is long/flat only — two
inversely-correlated longs still both lose in the regime that hurts them.

Unknown correlation is treated as fully correlated, which is the conservative
reading rather than the flattering one.

Verify the rules with `npm run check:portfolio` (23 checks).

## Trading stocks as well as crypto

Set **Symbol** in Settings to any Alpaca-supported instrument. The asset class
is inferred from the spelling — no extra configuration:

| Symbol | Asset class | Hours | Fees |
|---|---|---|---|
| `BTC/USD`, `ETH/USD` | crypto (slash) | 24/7 | 0.10% taker / 0.02% maker |
| `AAPL`, `SPY`, `NVDA` | US equity | market hours only | commission-free |

Handled automatically per asset class: the market-data endpoint
(`/v1beta3/crypto` vs `/v2/stocks`), the position symbol (`BTCUSD` vs `AAPL`),
time-in-force (`gtc` vs `day`), and the fee model.

Two equity-specific behaviours worth knowing:

- **Market hours.** Equities are shut nights, weekends and holidays — roughly
  75% of the time. The engine asks Alpaca's `/v2/clock` (so holidays and
  half-days are handled properly, not hardcoded) and stands down until the
  market reopens rather than firing orders into a closed venue.
- **Fractional shares can't use limit orders.** Alpaca rejects fractional
  limit orders, so a position of 12.7 shares is rounded down to 12 to keep the
  cheaper maker fill. Below one share it falls back to a market order.

### ⚠️ Pattern Day Trader rule — this matters for stocks

US margin accounts under **$25,000** are limited to **3 day trades per 5
business days**. This engine averages ~450 round trips a month, so a small
real-money stock account would be flagged as a Pattern Day Trader almost
immediately and then restricted from opening new positions.

This does not affect: crypto (exempt), Alpaca paper accounts (funded at
$100k), or cash accounts (settlement rules apply instead). But it does mean
**this strategy is not viable on a small real-money stock account.** Crypto has
no such restriction, which is why it remains the better fit for small capital.

Data note: free Alpaca plans serve IEX rather than full SIP consolidated data,
so equity bars are thinner than what a paid feed would show. Override with
`ALPACA_DATA_FEED=sip` if you have a subscription.

## Stage 1: Alpaca paper trading (real prices, no money at risk)

**Do this before any real money.** It is the only way to test against real
market data, which is the single biggest gap in every backtest in this repo —
all of the simulated results here run on synthetic prices.

Alpaca exposes the *same* REST API for paper and live; only the base URL and
keys differ. So this exercises the exact live code path end to end.

```
ALPACA_KEY_ID=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets    # <- paper endpoint
```

Then set **mode: live** in Settings.

> **Naming trap:** the app's "live" mode only means *"route orders to Alpaca
> instead of the internal simulator."* With `ALPACA_BASE_URL` pointing at the
> paper endpoint, **no real money is involved.** Real money requires
> deliberately changing that URL to `https://api.alpaca.markets`.

What to watch, in order of importance:

1. **Do recorded fill prices match Alpaca's dashboard?** The broker now reports
   only venue-confirmed fills at real `filled_avg_price`. If these diverge,
   stop — every P&L number and the kill-switch depend on them.
2. **What fraction of fills are maker vs taker?** Backtests assume ~88% maker.
   If live is mostly taker, real costs are ~0.1-0.2%/round trip higher than
   every backtest in this repo claims.
3. **Does net P&L after fees beat simply holding?** That is the only bar that
   matters. Fee drag alone runs 1.5-3% of capital per month at ~450 trades.

Use a **dedicated Alpaca account**. `getAccount` reports whole-account equity,
so position sizing and the daily-loss kill-switch measure against everything in
the account, including assets this bot never traded.

### What the live order path guarantees

- Orders are reported `filled` **only** when the venue confirms it, at the real
  `filled_avg_price` — never at an assumed price.
- Limit (maker) orders are actually sent when `limitOrderOffsetPct > 0`, so
  live execution matches the backtester's cost model.
- An unfilled entry is cancelled and re-evaluated; an unfilled **exit** is
  escalated to a market order, because an exit that never happens is a risk
  failure. Stop-losses always go straight to market.
- Dust orders below the venue minimum are refused locally rather than sent.

These paths are covered by a mock-venue test using real Alpaca response shapes,
but **have not been run against Alpaca's servers** — that is what stage 1 is for.

## Stage 2: going live (real money)

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
| GET | `/api/confidence` | Confidence score, size multiplier, per-factor breakdown |
| GET | `/api/events` | Upcoming scheduled releases, symbols on hold, calendar staleness |
| GET | `/api/ml/status` | ML model accuracy + feature importances |
| POST | `/api/ml/train` | Retrain the ML signal model now |
