# Freqtrade engine (Strive)

This is the **production trading engine** for Strive, built on
[Freqtrade](https://github.com/freqtrade/freqtrade) — a mature, battle-tested
crypto bot that handles real exchange execution, backtesting, hyperopt, and a
full ML pipeline (**FreqAI**). It runs alongside the lightweight built-in
TypeScript engine; use whichever you prefer. Freqtrade is the recommended choice
for anything approaching real money.

Everything here defaults to **dry-run (paper) mode** — no real funds — and binds
the UI to localhost only.

## What's in here

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | One-command run (Docker). |
| `user_data/config.json` | Dry-run config, safe risk limits, REST API + FreqUI. |
| `user_data/config-freqai.json` | FreqAI (ML) overlay — rich features + LightGBM. |
| `user_data/strategies/StriveStrategy.py` | Our hand-written strategies, ported. |
| `user_data/strategies/StriveFreqAI.py` | The "smartest model" — FreqAI + LightGBM. |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (the simplest way to run
  Freqtrade — no Python/TA-Lib setup).

## First-time setup

1. **Set your secrets** in `user_data/config.json` → `api_server`: change
   `jwt_secret_key`, `ws_token`, and `password` to your own random strings.
2. **Download historical data** (for backtesting; free, from the exchange):
   ```bash
   cd freqtrade
   docker compose run --rm freqtrade download-data \
     --pairs BTC/USDT ETH/USDT SOL/USDT BNB/USDT \
     --timeframes 1h 4h --days 800
   ```

## Classic strategy (no ML)

**Backtest:**
```bash
docker compose run --rm freqtrade backtesting \
  --strategy StriveStrategy -c user_data/config.json --timerange 20230101-
```

**Dry-run (paper, live data):**
```bash
docker compose up -d          # starts the bot + FreqUI
# open http://127.0.0.1:8080  (login with your config username/password)
docker compose logs -f        # watch it trade
```

## FreqAI — the smart ML model

FreqAI trains a model on a rolling window and keeps retraining as new data
arrives. The feature set is deliberately broad (Qlib Alpha158-style): base
indicators expanded across periods, timeframes, correlated pairs, and shifted
candles → hundreds of features into LightGBM. A dissimilarity-index gate
suppresses predictions on unfamiliar market states (the built-in "only trade
when confident").

1. **Use the ML image** — edit `docker-compose.yml`: switch the image to
   `freqtradeorg/freqtrade:stable_freqai` and use the commented-out FreqAI
   `command`.
2. **Backtest** (trains + tests across the range):
   ```bash
   docker compose run --rm freqtrade backtesting \
     --strategy StriveFreqAI \
     -c user_data/config.json -c user_data/config-freqai.json \
     --freqaimodel LightGBMRegressor --timerange 20230601-
   ```
3. **Dry-run:** `docker compose up -d` (with the FreqAI command active).

Read the backtest summary honestly: look at profit **after fees**, drawdown, and
whether the edge holds across the whole period — not just the best months.

## Tuning (hyperopt)

Optimize thresholds / ROI / stoploss against your data:
```bash
docker compose run --rm freqtrade hyperopt \
  --strategy StriveStrategy -c user_data/config.json \
  --hyperopt-loss SharpeHyperOptLoss --epochs 200 --spaces buy sell roi stoploss
```

## Going live (real money) — do this last

Only after you've watched dry-run behave for weeks:
1. In `config.json`: set `"dry_run": false` and add your exchange API
   `key`/`secret` (create keys with **trading** but **not withdrawal**
   permission).
2. Start small. Keep `max_open_trades` and `dry_run_wallet`→real stake modest.
3. Freqtrade enforces your `stoploss`, ROI, and `max_open_trades` as hard risk
   limits — keep them conservative.

> Same honest caveat as the rest of Strive: a proven engine and a broad feature
> set do **not** manufacture an edge. Crypto signal prediction is hard; most
> backtested edges shrink or vanish live. Prove it on paper, size small, and
> treat any strategy as disposable.

## Using the Strive dashboard with Freqtrade

Freqtrade ships its own UI (**FreqUI**, at `http://127.0.0.1:8080`) with charts,
trade history, and controls — you get it for free with `api_server` enabled.
Wiring the custom Strive dashboard to Freqtrade's REST API is a possible
follow-up; for now FreqUI is the recommended interface for this engine.

## Where Qlib could fit later

[Qlib](https://github.com/microsoft/qlib) is a research framework, not a live
bot. The natural pattern is: research and train an alpha model in Qlib offline,
then serve its predictions into FreqAI as a custom model or as an extra feature.
That's a larger, cross-ecosystem project — the FreqAI setup here already gives
you Qlib-style feature breadth inside the engine you're actually running.
