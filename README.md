# Auto-Trader — Personal AI Trading Platform

A single-user **execution and risk harness** for automated trading, with a
dashboard. It runs a strategy on a loop, prices fills honestly, keeps stops at
the venue, and measures whether any of it works.

**Spot FX only, through OANDA.** Seven USD majors, quoted against the dollar
(so USD/JPY is traded as JPY/USD — see [Spot FX](#spot-fx--the-cheapest-thing-here-by-a-factor-of-65)
for why). Crypto and US equities were supported via Alpaca and were removed:
execution cost is the binding constraint at small size, and the FX majors cost
roughly a sixty-fifth of crypto per round trip. The crypto and equity cost
models survive only inside the comparison tools that measured that.

> ### What this is, and what it is not
>
> The risk and execution machinery is the real content here: no-lookahead
> fills, a calibrated cost model, venue-side stop-losses that survive a crash,
> a daily-loss kill-switch, and measurement harnesses that are allowed to
> return "no".
>
> **Nothing in this repository has demonstrated a trading edge.** Every
> performance figure comes from a synthetic price generator, not a market —
> and when that generator was corrected to behave like real returns, **every
> strategy lost money and the best available outcome was not trading at all.**
> See [the most important finding](#the-most-important-finding-in-this-repository).
>
> ⚠️ **Trading involves real financial risk.** This defaults to **paper
> trading** on purpose. Automated strategies that look great on historical
> data routinely lose money live. Prove a configuration out on paper for weeks
> before you consider real money. Nothing here is financial advice.

## Two engines

Strive has two interchangeable trading engines:

- **Built-in (this app)** — a lightweight, zero-setup TypeScript engine with its
  own dashboard, AI strategy selection, self-improvement loop, and ML signal
  model. Great for exploring and running instantly.
- **Freqtrade** (`freqtrade/`) — a mature, production bot (real exchange
  execution, backtesting, hyperopt, and the **FreqAI** ML pipeline) wired up
  with our strategies and a rich, Qlib-style feature set. Note it is
  crypto-oriented and was set up before this platform moved to FX, so its
  configuration still targets exchanges rather than OANDA. See
  [`freqtrade/README.md`](freqtrade/README.md).

## Quick start (zero config)

```bash
npm install
npm run dev
```

Open <http://localhost:5000> and press **Start**. With no API keys the platform
runs on **synthetic market data** and a **simulated broker**, so you can watch
the whole system work end-to-end with zero setup and zero risk.

## Connecting your OANDA account

1. **Create the account.** A [practice account](https://www.oanda.com/) is free
   and takes a few minutes. Use practice first — nothing below is proven.
2. **Generate a v20 API token.** In the OANDA web dashboard: *Manage API
   Access* → *Generate*. It is shown **once**.
3. **Find your account id.** Same dashboard, a four-part number like
   `001-004-1234567-001`. Not your login, and not the account nickname.
4. **Create `.env`** next to `package.json` (`cp .env.example .env`):

   ```
   OANDA_API_TOKEN=your_token
   OANDA_ACCOUNT_ID=001-004-1234567-001
   OANDA_BASE_URL=https://api-fxpractice.oanda.com
   ```

   The token and the URL must **match the account type** — a practice token
   fails against the live host and vice versa.

5. **Restart and read the banner.** This is the check that matters:

   ```
   market data: OANDA (real FX prices) — endpoint https://api-fxpractice.oanda.com
   orders: OANDA PRACTICE account — no real money at risk
   ```

   Still seeing `SYNTHETIC DATA`? The file was not read. On Windows the usual
   cause is Notepad saving `.env.txt` — check with `dir /a .env*`. Set
   `REQUIRE_REAL_DATA=1` to make that a hard failure instead of a silent
   fallback.

Keys alone do not trade: the engine stays on the simulated broker until you
also set **mode: live** in Settings, and `/api/config` refuses live mode
outright when credentials are missing. Note the URL is what decides real money
— anything that is not `api-fxpractice` prints
`*** OANDA LIVE — REAL MONEY ***`.

**Expect the proof-of-edge gate to block every live entry.** It wants 30
realised trades with positive expectancy and no strategy has that. That is the
system working, not a bug — see [the no-trade gate](#the-no-trade-gate).

## The most important finding in this repository

**Every performance number produced before this section was an artifact of the
price generator, not a property of trading.**

`npm run facts` scores the synthetic feed against the empirical stylized facts
of asset returns (Cont 2001). The original generator — a uniform shock around a
persistent drift, at constant volatility — **failed all six**, and two failures
were serious enough to invalidate conclusions:

| fact | old generator | why it matters |
|---|---|---|
| Excess kurtosis | **−0.97** | *Thinner*-tailed than Gaussian. Zero tail risk, so every stop and position size was tuned for a world without disasters. |
| Return autocorrelation (lag 1) | **+0.12** | Handed trend-following a **free edge no real market provides**. |
| Volatility clustering | **−0.00** | Constant volatility, so volatility *targeting* was never once tested at the job it exists for. |

That +0.12 is the whole story of this project's earlier results. A drift held
for 30–120 bars makes consecutive returns correlated, and a moving-average
crossover exists precisely to harvest that. "Breakout Momentum wins every
measurement" was never a finding about trading.

The generator is now **GJR-GARCH(1,1) with Student-t innovations** — fat tails,
volatility arriving in slow-decaying bursts, larger response to falls than
rises, and near-zero return autocorrelation. It passes all six facts on every
seed tested.

### What that did to the conclusions

The switch-margin sweep, same code, same seeds, only the price process changed:

| `SWITCH_MARGIN` | old generator | corrected generator |
|---|---|---|
| 4 | 83.90% | **−15.75%** |
| 12 | 92.61% | **−17.70%** |
| 20 | 94.76% | **−17.97%** |
| best available fixed strategy | 98.01% | **0.00%** (the model that declines to trade) |

Read that last row carefully. Once the manufactured trend edge is removed and
real costs are applied, **every strategy here loses money, and the best
available outcome is not trading at all.**

The earlier "+10.86pp at margin 20" result does not replicate: the ordering
reverses and every difference falls inside the noise. `SWITCH_MARGIN` stays at
12 on the *argument* — each switch pays a 0.60% round trip and nothing has
shown switching earning that back — not on the discredited measurement.

> This is what the measurement machinery is for. It was built to be capable of
> returning "no", and when pointed at a corrected price process, it did.

Gate anything you take from the synthetic feed:

```bash
npm run facts       # 18 checks across 3 seeds; non-zero exit if any fail
```

Passing does **not** make it a market. It only means results are not an
artifact of a qualitatively wrong price process. Real data remains the only
way to answer the question properly.

## The no-trade gate

`server/trading/expectancy.ts`. **The engine refuses to open LIVE positions
until the active strategy has proven a positive edge on its own realised
trades.**

This exists because every measurement in the project points one way:

| policy | return |
|---|---|
| **ML Signal Model** | **0.00%** — declines to trade |
| OOS selection | −10.05% |
| best technical strategy | −12.89% |
| in-sample selection | −14.17% |

The ML model gets that right for a specific reason: `isTradable()` refuses
unless it beats its majority-class baseline. Nothing equivalent guarded the
technical strategies, so a rule with **demonstrated negative expectancy would
happily trade a live account.**

The bar is deliberately low and is a floor, not a target. It asks only for a
positive mean return per trade, over ≥30 trades, significantly above zero
(t > 1.7), net of the costs actually charged. A rule that cannot clear "better
than nothing on its own recent record" has no business sizing real money.

**Paper is never gated** — the evidence can only come from taking the trades,
and blocking paper would make the gate unsatisfiable. The dashboard shows the
reading either way, so you can see how far off it is.

## What re-measuring everything on the corrected generator changed

Every conclusion in this repo was re-run after the price generator was fixed.
Three survived, two reversed, one turned out to have its own copy of the bug:

| finding | verdict |
|---|---|
| Cost model was wrong (crypto undercharged, equities overcharged) | **Holds** — and is sharper. At old costs strategies were roughly break-even; corrected costs are what tip them into clear losses. |
| Diversification: effective N ≈ 1.15 at ρ=0.85, don't add symbols | **Holds** — and `diversificationEval` had its *own* Gaussian generator, so the fix to the shared one left it untouched. A local copy of a defect outlives the fix to the original. |
| News ablation harness detects planted edges, not noise | **Holds** |
| Widening the day-trading target was worth +0.65pp | **Retracted** — the whole grid spans 0.10pp and every width loses. |
| `SWITCH_MARGIN` 12 is an evidence-backed optimum | **Retracted** — ordering reverses, all differences inside the noise. Kept on the cost argument alone. |
| OOS selection is "a measured failure" | **Reversed** — it is now significantly *better* than the incumbent (+4.12pp, t=2.68). Still not wired in, because both lose to not trading. |

## Running it on your own PC

Clone the repo, then **double-click `run-windows.bat`**. It checks Node, installs
dependencies on first run, warns about the `.env.txt` trap, and opens on
<http://localhost:5000>. On macOS/Linux use `npm install && npm run dev`.

For a long-running setup, build once and run the compiled server:

```bash
npm run build
npm start          # serves the built client, no dev toolchain in the loop
```

### Will the GPU make it faster? No — and here is why

Worth answering properly, because it is the natural thing to reach for and it
is the wrong lever for this workload:

- **The ML model is tiny.** A logistic regression over ~6,000 samples × 14
  features is a few million floating-point operations. Copying that to a GPU
  and back costs more than doing the arithmetic on the CPU.
- **The hot path is inherently sequential.** A backtest loop cannot be
  parallelised: bar *i+1*'s position depends on what happened at bar *i*. A
  dependency chain is the one shape no amount of hardware helps with.
- **What IS parallel is the number of independent runs.** A sweep is 240
  separate backtests that never talk to each other. That is coarse-grained
  parallelism, and it belongs on CPU cores.

So the speed work went into worker threads, not shaders:

```bash
npm run sweep:margin      # 140 backtests across your cores
```

Measured on a 4-core machine: **10.0s serial → 4.5s on 3 workers**, producing
byte-identical numbers. Modest here; it scales better on the larger sweeps. The
identical-output property is the one that matters — a faster measurement that
disagrees with the slow one is not a speedup, it is a second bug.

GPU only becomes a real question if this grows a genuinely heavy model
(gradient boosting over years of tick data, a neural net). That is the
**Freqtrade/FreqAI** path in [`freqtrade/`](freqtrade/README.md), which is
Python and already has the ecosystem for it — not this TypeScript engine.

## Calibration — does each setting actually do anything?

```bash
npm run calibrate
npm run calibrate -- volTargetPct=0.004      # test a value before adopting it
npm run calibrate -- preset=forex            # test a whole universe
```

Prints every configured magnitude beside the value **measured in your data**,
and flags any that cannot bind.

This exists because two risk controls shipped switched-on, visible in the UI,
and structurally incapable of ever acting: `portfolioVolTargetPct` was set ~9×
above the highest volatility the book could reach, and `volTargetPct` sat so
far above realised volatility that its multiplier was pinned at the 2.0 clamp
for every symbol — it could only ever size *up*, the opposite of its purpose.

Both numbers were **derived from other numbers rather than measured**. Both
looked entirely reasonable. Neither was caught by typechecking, unit tests, or
watching the app run, because *a control that never fires looks exactly like a
calm market*.

The probe catches both in one command:

```
[INERT] volTargetPct           configured 0.400%
                               measured   realised 0.144% · multipliers 2.00
                               pinned at the 2.0 clamp — can only size UP, never down
[INERT] portfolioVolTargetPct  configured 0.800%
                               measured   max reachable book vol 0.086%
                               above anything the book can reach — will never bind
```

**Run this after changing any risk setting.** It is the cheapest habit in the
repo, and `npm test` now runs it across **every preset** — the settings are all
volatility-denominated and the presets differ in volatility by more than an
order of magnitude, so one run on whichever universe happens to be configured
proves nothing about the others. That is exactly how the FX preset first
arrived with two controls that could never bind while the gate reported green.

It also caught a setting that had been "fixed" once already:
`portfolioVolTargetPct` was 0.060% against a measured ceiling of 0.059%. Not
wrong by an order of magnitude any more — just sitting *precisely* on the
boundary, so whether it read OK or INERT depended on how many bars the estimate
used. It is now ~60% of the ceiling, with room to actually bind.

## How it works

Each tick (every `intervalSeconds`), the engine:

1. **Pulls market data** — real OANDA FX bars where credentials are set,
   otherwise a synthetic price series. Symbols whose market is shut (FX is
   24/5), or which the venue does not carry, are skipped with a logged reason
   rather than ordered into.
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

It is also **not where the value is**, and the section below shows the working.
Pinning one strategy (`autoSelectStrategy: false`) is a defensible default.

### A known limitation of auto-selection

Auto-selection scores every strategy by backtesting it on the *same* recent
window it is about to trade forward from. That is **in-sample selection**, and
over a few hundred bars the score differences are largely noise.

> ⚠️ **The tables in this section were produced on the OLD price generator**,
> which had +0.12 return autocorrelation and no fat tails. They are kept as the
> record of how the reasoning went, not as evidence. See
> [the most important finding](#the-most-important-finding-in-this-repository)
> for what happened when the generator was corrected.

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
npm run train                                   # EUR/USD, hourly, ~2 years
npm run train -- --symbol GBP/USD --bars 12480  # more/other data
npm run train -- --refresh                      # force a fresh download
```

This downloads real OHLCV **from OANDA** — the same vendor the live engine
prices against, which is the right property for training data to have: a model
trained on one vendor's bars and traded against another's learns the difference
between them as well as the market. It then trains and
**saves the model to disk** (`data/ml-model.json`). The app loads that mature
model on startup and won't overwrite it with light live-feed retraining.

**Training now requires OANDA credentials.** There is no keyless FX feed, so
this fails with an explicit message rather than quietly training on something
else. Note also that FX has no weekend session: a year is ~6,240 hourly bars,
not 8,760, so a "2 year" download returning fewer bars than a 24/7 instrument
would is correct rather than truncated.

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

### News sentiment — built, measured, and REMOVED

A headline-sentiment pipeline used to live here: `trading/news.ts` pulled
articles from Alpaca's news API and scored them with a finance lexicon,
`ml/newsFeatures.ts` turned that into four per-bar features, and
`ml/newsAblation.ts` tested whether they earned their place.

**They did not.** Held to the standard every feature here has to meet — does
adding this beat the same model without it, out of sample — the news features
did not clear the bar, so they were never wired into a trade.

All three modules were deleted with the move to FX. They depended on Alpaca's
news history, which is gone, and nothing else imported them; keeping a
plausible-looking sentiment pipeline that could no longer fetch anything would
be exactly the sort of dead code this repo has been bitten by before.

The finding stands on its own and is the part worth keeping: a sentiment
feature that cannot be shown to add out-of-sample skill is a guess with extra
steps, however sophisticated the scoring.

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

## Execution costs — the term that dominates at small size

`server/trading/costs.ts` is now the ONE source of truth for what a trade
costs. There used to be two, and they disagreed: flat constants in
`execution.ts` charging crypto and equities the same rate, plus a per-asset
`feeRatesFor()` in `assets.ts` that **nothing ever called**. The model was
wrong in both directions at once.

| | old model | corrected | error |
|---|---|---|---|
| crypto taker round trip | 0.300% | **0.600%** | +0.300pp |
| crypto maker round trip | 0.040% | **0.300%** | +0.260pp |
| equity taker round trip | 0.240% | **0.040%** | −0.200pp |

Crypto was undercharged (0.10%/side modelled vs Alpaca's ~0.25% entry tier);
equities were charged a commission Alpaca doesn't levy. Re-pricing the same
strategies on the same bars:

| strategy | old cost | corrected | delta |
|---|---|---|---|
| Breakout Momentum (swing) | 14.93% | 11.49% | **−3.44pp** |
| Breakout Momentum (day) | 15.37% | 9.65% | **−5.72pp** |

The error scales with turnover, so the day profile lost most — which is the
point. **Calibrate these against your own fills**: every rate is overridable in
Settings, and the dashboard shows what's in force plus what share of your
profit target it eats. Getting this wrong in the optimistic direction
manufactures an edge that isn't there.

```bash
npx tsx server/trading/costEval.ts        # the tables above
npx tsx server/trading/turnoverEval.ts    # how wide a target needs to be
```

### Spot FX — the cheapest thing here by a factor of 65

Cost is the binding constraint at small size, so the largest available
improvement is not a better signal, it is a cheaper market. Measured through
the same cost model, per round trip:

| instrument | round trip | vs crypto | share of its own target |
|---|---|---|---|
| crypto (Alpaca tier 1) | 0.600% | 1× | 15.0% of a 4% target |
| US equity (Alpaca) | 0.040% | 15× cheaper | 1.0% |
| **USD/JPY** | **0.0064%** | **94× cheaper** | **0.9% of a 0.32% target** |
| **EUR/USD** | **0.0093%** | **65× cheaper** | **1.9%** |

The concrete version, from `forexChecks.ts`: a $50 position and a 0.5%
favourable move nets **+$0.2438 on EUR/USD** and **−$0.05 on crypto** — the
crypto round trip is larger than the entire gross move.

Note this corrects a figure I gave earlier in the project. I had put EUR/USD at
0.018% by applying a "both sides" doubling on top of a number that was already
a full spread. A round trip pays *one* spread: half on entry, half on exit.

**Every pair is traded turned to face USD.** USD/JPY is held internally as
JPY/USD. This is the one design decision the rest depends on, because the whole
codebase assumes `notional = qty × price` and `P&L = (exit − entry) × qty`.
Both hold exactly for a USD-quoted pair; **neither** holds for a USD-base one,
where the price move accrues in yen. Inverting once at the feed boundary keeps
every downstream calculation exact instead of threading a currency conversion
through the backtester, the brokers, sizing and P&L — four edits to the most
safety-critical arithmetic here, each a place to be quietly wrong about money.
Long JPY/USD *is* short USD/JPY; the dashboard shows the conventional name.

What FX also brings, none of it free:

- **Sessions.** 24/5, Sunday 17:00 ET to Friday 17:00 ET — not 24/7 and not an
  equity session. Entries are also blocked through the 17:00 rollover, when
  spreads widen several-fold. Same logic as the event blackout: no prediction,
  just declining to cross a spread at its worst.
- **Overnight carry**, modelled as a flat cost rather than a guessed interest
  differential. Guessing would half the time invent a *credit*, which is the
  direction that fabricates edge. Triple on Wednesdays (spot settles T+2).
- **Risk scaling.** An FX major moves ~1/12 of crypto per bar, so an unscaled 4%
  take-profit is an eighteen-sigma move that never fires. `scaleRiskByAssetClass`
  scales the stop, target, volatility target and maker offset per instrument,
  keeping the ratios the measured sweeps established.
- **No leverage.** FX brokers offer 30:1 and up; none of it is exposed here.
  The cheap spread is the point; the leverage is what turns a small account into
  a margin call, and the sizing controls only mean what they say unlevered.
- **Majors only, USD legs only.** Crosses like GBP/JPY are recognised (so they
  are never misfiled as crypto) but refused with an explanatory error, because
  they have no USD leg to settle into.

**The OANDA adapter has not been run against the live API**: it was written from the v20
spec, since the sandbox is unreachable from where it was built. Treat the first
practice-account run as the real test and reconcile the first few fills by hand.

#### Does the cheaper market actually change the outcome?

```bash
npx tsx server/trading/forexEval.ts
```

Same strategies, same path count, 40 paths × 6000 bars, each class with its own
costs and volatility-scaled risk. **Taker fills** — crossing the spread every
time, no fill-model assumptions:

| strategy | crypto | equity | forex |
|---|---|---|---|
| SMA Trend Following | −5.61% ±0.10 | 0.01% ±0.05 | **+0.20% ±0.03** |
| RSI Mean Reversion | −2.79% ±0.07 | −0.49% ±0.04 | −0.52% ±0.06 |
| Breakout Momentum | −8.70% ±0.10 | −0.09% ±0.06 | **+0.49% ±0.05** |

**Do not read that as "FX is profitable."** Two things had to be ruled out
before the table meant anything at all, and both are in the file:

1. *An earlier version of this reported the maker column* (+0.69% equity,
   +0.57% FX) and looked like moving markets had made a losing system a winning
   one. It hadn't. Equities and FX pay no commission, so a modelled maker fill
   executes at the posted limit for free and the backtester credits ~2× the
   offset in spread capture on every round trip — with **no adverse selection**,
   because a resting order here fills whenever the bar's range touches it. In a
   real book you get filled by someone who wanted that price. The maker column
   is an upper bound; the taker column is the one to trust.

2. *The FX column is positive, which on a driftless series would be an
   artifact.* So: shuffle the bars in time, keeping every bar's shape and the
   whole return distribution, destroying volatility clustering and the regime
   blocks. Everything collapses:

   | | original | shuffled |
   |---|---|---|
   | SMA Trend Following | +0.20% (t=5.9) | +0.04% (t=1.3) |
   | RSI Mean Reversion | −0.52% (t=−8.7) | +0.02% (t=0.4) |
   | Breakout Momentum | +0.49% (t=9.9) | +0.01% (t=0.2) |

   The backtester is not inventing the returns — good. What the strategies are
   reading is this generator's **regime drift**, a trend deliberately built into
   `marketData.ts` so strategies have something to find. A real FX major has far
   less of it.

So the honest claim is narrow and worth stating exactly: **an edge of this size
survives FX costs and does not survive crypto costs.** Same edge, same
strategies, same paths — only the execution bill differs, and it accounts for
the entire gap between the crypto column and the other two. Cheaper execution
multiplies an edge; it never creates one. Whether a real edge exists is a
question only real data can answer (`npm run train`).

### The day profile was fighting its own costs

At a 1.5% take-profit target and a 0.60% round trip, **40% of the gross target
went to execution before being right about anything.** Sweeping the target on
8 train + 8 unseen paths was monotonic — every widening step raised returns AND
cut trade count:

| stop / target | cost as % of target | validate | trades |
|---|---|---|---|
| 1.0% / 1.5% (old) | 40% | 3.76% | 147 |
| 2.0% / 4.0% (**new**) | 15% | 4.41% | 96 |
| 3.0% / 6.0% | 10% | 4.53% | 88 |

The day profile is now 2.0%/4.0% with a 360-minute holding cap. Deliberately
**not** the winning 3.0%/6.0%: the backtester doesn't model `maxHoldingMinutes`,
so the sweep never had to hit its target inside a session and couldn't penalise
a target that wouldn't arrive in time.

### Maker-only entries

`limitOrderOffsetPct > 0` (the default) already makes both brokers cancel an
unfilled entry rather than crossing, so in backtests maker-only changes
**nothing — measured at exactly 0.00pp.** Where it bites is live equities: an
order for under one share could not be a limit order, so `roundQtyFor`
silently downgrades it to a market order. **On a small account every equity
position is sub-share**, so those entries crossed the spread every time
regardless of the offset. The `makerOnlyEntries` setting skips them instead.

## Portfolio volatility budget

`server/trading/portfolioVol.ts`. Per-symbol vol targeting gives each position
the intended risk; nothing was looking at what they add up to. Three positions
each sized to 0.4% vol at 0.9 correlation make a **1.16% book** — nearly triple
the risk every individual sizing decision believed it was taking.

This solves the quadratic for the largest candidate weight that keeps total
portfolio vol inside its budget, exactly. Like the confidence governor it only
ever scales **down**: vol targeting that scales up lets a quiet market talk the
engine into leverage right before volatility returns.

Held-vs-held correlations are unmeasured and assumed to be 1 — overstating risk
rather than understating it, the only safe direction.

**The first version of this shipped inert, and only running it found that.**
The default budget was 0.8% per bar, reasoned from the 0.4% *per-position*
default without checking what per-bar *equity* volatility actually is. Measured:
liquid crypto runs ~0.15% per bar on the 1-minute bars the engine uses, so a
fully-invested, perfectly-correlated book tops out near 0.09%. The budget sat
~9x above anything reachable and never once bound — and the schema's minimum
of 0.1% was *itself* above that ceiling, so the setting's entire legal range
was in the inert zone. Default is now 0.06% with a floor of 0.01%.

> ⚠️ This is a **per-bar** figure, so it scales with roughly √(interval). On
> hourly bars the same book is ~8x more volatile per bar and the budget needs
> raising to match. Recalibrate if you change the bar interval.

Verified live: the engine logs `risk_block | ETH/USD: book vol 0.06% already at
the 0.06% budget` and repeats it across symbols as the book fills. The
*partial-scaling* branch (multiplier strictly between 0 and 1) is covered by
unit checks — including that the solve lands the book exactly on budget at
three correlation levels — but is rarely the branch taken in practice: with
equal-sized, near-perfectly-correlated positions the book steps *over* the
budget in one position's worth of volatility, so it is usually already at the
limit rather than just under it.

## More symbols? Measured, and the answer is no (for now)

The √N diversification argument holds only for **independent** bets.
`npx tsx server/trading/diversificationEval.ts` measures what actually happens
at realistic correlation:

| N positions | effective N at ρ=0.85 |
|---|---|
| 1 | 1.00 |
| 3 | 1.11 |
| 8 | **1.15** |

**Eight correlated crypto positions carry the risk-reduction of barely more
than one.** Raising `maxConcurrentPositions` buys turnover and fees, not
diversification — so it stays at 3.

The sharper finding: across every correlation level, adding symbols made
Sharpe **worse**, monotonically. Averaging N return streams cuts volatility by
~√N while leaving the mean unchanged, so Sharpe scales by √N — *including when
the mean is negative*. **Diversification amplifies whatever edge you have,
sign included.** It is a multiplier to apply once an edge is demonstrated, not
a way to create one.

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
| Spot FX | `STOP`, GTC, signed units in the venue's own direction |
| Equities | `stop`, GTC |
| Limit price | 0.5% below the trigger, so it fills through a fast move |

Deliberately the **stop only**, not a bracket with a take-profit attached.
OANDA's bracket support is not used here, so a paired take-profit would
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

> **Spot FX is exempt from the Pattern Day Trader rule**, which caps US margin
> accounts under $25k at 3 day trades per 5 business days. That exemption is
> part of why FX suits a small account — this profile would breach the rule
> immediately on equities.

> **More trades means more cost.** Fee drag already runs 1.5-3% of capital per
> month at swing frequency. This profile trades considerably more, against an
> edge that has not been demonstrated — every measurement so far says there
> isn't one yet. Prove it on paper first.

## Multi-symbol trading (the AI picks what to trade)

### Universe presets

```bash
curl localhost:5000/api/universes                     # list presets
curl -X POST localhost:5000/api/universes/majors/apply
```

| Preset | Symbols | Notes |
|---|---|---|
| `majors` | 7 | All USD majors — widest selection |
| `tightest` | 4 | Cheapest to trade; roughly half the execution cost of the wider set |
| `eurusd` | 1 | No diversification; for testing one pair properly |

**A wide universe does not mean a big book.** The engine scans everything each
tick, but the portfolio limits still decide what it may hold — 3 concurrent
positions and 60% total exposure by default. Breadth buys *selection*, not
risk: more candidates to pick the best from.

Symbols are fetched with a bounded worker pool (8 in flight). Sequentially, 40
symbols at ~200ms each would take ~8s per tick and starve the loop; unbounded,
it would burst through OANDA's rate limit. Measured: 8023ms
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

## Instruments

Spot FX only. Set **Symbol** in Settings to a tradeable pair, or apply a
universe preset:

| Preset | Pairs | Notes |
|---|---|---|
| `majors` | 7 | All USD majors |
| `tightest` | 4 | EUR/USD, JPY/USD, GBP/USD, CAD/USD — cheapest to trade |
| `eurusd` | 1 | One pair, properly |

**Every pair is quoted against USD.** USD/JPY is entered and displayed as
`JPY/USD`, USD/CHF as `CHF/USD`, USD/CAD as `CAD/USD`. Long `JPY/USD` is short
`USD/JPY` — the same economic position, turned to face the dollar so that
`notional = qty × price` and `P&L = (exit − entry) × qty` both hold exactly in
dollars. Crosses like `GBP/JPY` are recognised but refused with an explanatory
error: they have no USD leg to settle into.

Handled automatically: the OANDA instrument name (`USD_JPY`), the direction and
sign of every order for inverted pairs, unit rounding, 24/5 session gating, the
17:00 ET rollover blackout, per-pair spreads, and overnight carry.

Two FX-specific behaviours worth knowing:

- **24/5, not 24/7.** The week runs Sunday 17:00 ET to Friday 17:00 ET. The
  engine stands down over the weekend rather than firing orders into a shut
  market, and the day profile's flatten rule targets the *Friday* close — the
  only moment a position faces a gap it cannot be stopped out of.
- **One unit is the minimum.** About 90p of EUR. This is the reason FX works on
  a small account at all: a lot-based broker forces a 1,000-unit micro lot
  (~£850), which on a £100 account is 9× leverage before any position sizing
  has happened. No leverage is exposed here at all.

## Stage 1: OANDA practice trading (real prices, no money at risk)

**Do this before any real money.** It is the only way to test against real
market data, which is the single biggest gap in every backtest in this repo —
all of the simulated results here run on synthetic prices.

OANDA exposes the *same* v20 REST API for practice and live; only the host and
token differ. So this exercises the exact live code path end to end.

```
OANDA_API_TOKEN=...
OANDA_ACCOUNT_ID=001-004-1234567-001
OANDA_BASE_URL=https://api-fxpractice.oanda.com     # <- practice endpoint
```

Then set **mode: live** in Settings.

> **Naming trap:** the app's "live" mode only means *"route orders to OANDA
> instead of the internal simulator."* With `OANDA_BASE_URL` pointing at the
> practice host, **no real money is involved.** Real money requires
> deliberately changing that URL to `https://api-fxtrade.oanda.com`.

> **The adapter has never run against the real API.** It was written from the
> v20 spec and driven over HTTP against a mock venue, which confirmed the wire
> format — signed units, conventional instrument names, inverted stop sides —
> but a mock built from the same reading of the spec cannot catch a misreading
> of it. Reconcile the first few fills by hand.

What to watch, in order of importance:

1. **Do recorded fill prices match OANDA's dashboard, and in the right
   direction?** For an inverted pair the app shows JPY/USD ~0.0064 where OANDA
   shows USD/JPY ~157, and a *long* here is a *short* there. Both should
   describe the same position. If they diverge, stop — every P&L number and
   the kill-switch depend on this.
2. **What fraction of fills are maker vs taker?** Backtests assume ~88% maker.
   If live is mostly taker, real costs are ~0.1-0.2%/round trip higher than
   every backtest in this repo claims.
3. **Does net P&L after fees beat simply holding?** That is the only bar that
   matters. Fee drag alone runs 1.5-3% of capital per month at ~450 trades.

Use a **dedicated OANDA account**. `getAccount` reports whole-account NAV, so
position sizing and the daily-loss kill-switch measure against everything in
the account, including positions this bot never opened.

### What the live order path guarantees

- Orders are reported `filled` **only** when the venue confirms it, at the real
  `filled_avg_price` — never at an assumed price.
- Limit (maker) orders are actually sent when `limitOrderOffsetPct > 0`, so
  live execution matches the backtester's cost model.
- An unfilled entry is cancelled and re-evaluated; an unfilled **exit** is
  escalated to a market order, because an exit that never happens is a risk
  failure. Stop-losses always go straight to market.
- Dust orders below the venue minimum are refused locally rather than sent.

These paths are covered by a mock-venue test using OANDA v20 response shapes,
but **have not been run against OANDA's servers** — that is what stage 1 is for.

## Stage 2: going live (real money)

Live trading is a first-class mode, but off until *you* turn it on:

1. Create an [OANDA](https://www.oanda.com) account and generate a v20 API
   token (*Manage API Access* → *Generate*).
2. Set environment variables (see `.env.example`):
   ```
   OANDA_API_TOKEN=...
   OANDA_ACCOUNT_ID=001-004-1234567-001
   OANDA_BASE_URL=https://api-fxpractice.oanda.com   # practice endpoint
   ```
   Use the **practice** host first — same API, fake money on their side.
   Switch to `https://api-fxtrade.oanda.com` only when you are ready, and
   remember the token must match the account type.
3. In **Settings**, flip **Live trading** on. The server refuses live mode
   unless credentials are present.
4. Expect the **proof-of-edge gate** to block every entry until a strategy has
   30 realised trades with positive expectancy. Turning that off is disabling
   a safety feature built precisely because the evidence says do not trade.

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
    brokers.ts          Broker interface, PaperBroker, OandaBroker
    marketData.ts       OANDA FX bars + synthetic fallback
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
    dataSource.ts       Real historical OHLCV downloader (OANDA)
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
| GET | `/api/costs` | Execution rates in force and what share of your target they eat |
| GET | `/api/ml/status` | ML model accuracy + feature importances |
| POST | `/api/ml/train` | Retrain the ML signal model now |
