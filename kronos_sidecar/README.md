# Kronos sidecar

[Kronos](https://github.com/shiyu-coder/Kronos) is a Python/PyTorch
foundation model for financial candlesticks. It has no relationship to
Node.js, so it runs here as a small standalone HTTP service that the trading
app calls over `localhost` — the same shape as the existing optional
`screener/screen.py`, not a rewrite of anything in `server/`.

**Read this first:** the `kronos_forecast` strategy this powers is not
proven to work on spot FX. Kronos's own public demo forecasts BTC/USDT; there
is no claim anywhere in its README that it was trained or validated on FX
data. Like every other strategy in this project, it only reaches real money
through the same `requireProvenEdge` gate everything else goes through —
30+ trades with a real, statistically significant positive return. Treat it
as a new candidate to measure, not a trusted addition.

## Setup

The Kronos source itself is vendored as a git submodule (not a pip package —
upstream has no PyPI release):

```bash
git submodule update --init vendor/kronos
```

Then, in a virtualenv:

```bash
pip install -r kronos_sidecar/requirements.txt
```

`torch` is the heavy part of that install (CPU-only build is fine — no GPU
required, just slower per forecast). Expect a few hundred MB to a couple GB
depending on platform.

## Running

```bash
python kronos_sidecar/server.py
```

First run downloads the model + tokenizer weights from the Hugging Face
Hub (`NeoQuasar/Kronos-small` + its matching tokenizer by default — a few
hundred MB, cached locally after that). Listens on `127.0.0.1:8787`.

Env vars:

| Var | Default | Meaning |
|---|---|---|
| `KRONOS_MODEL_SIZE` | `small` | `mini` (4.1M params, fastest), `small` (24.7M), or `base` (102.3M, slowest/most capable) |
| `KRONOS_PORT` | `8787` | sidecar listen port — must match `KRONOS_SIDECAR_URL` in the app's `.env` |
| `KRONOS_STUB` | unset | set to `1` to run without any model weights or Hugging Face access at all — returns a clearly-fake deterministic forecast, useful for testing the app's wiring |

## Test it without downloading anything

```bash
KRONOS_STUB=1 python kronos_sidecar/server.py
curl http://127.0.0.1:8787/health
```

## Why a separate process instead of a port of the model to TypeScript

Kronos is a ~25–100M parameter Transformer with a custom tokenizer for
OHLCV data — porting the architecture and re-implementing autoregressive
sampling in TypeScript, from scratch, without a JS-native tensor/inference
library, would be a much larger and much riskier undertaking than running
the reference Python implementation as-is and talking to it over HTTP. The
app is built to treat the sidecar as unreliable: if it's not running, or a
request fails, `kronos_forecast` falls back to `hold` rather than the engine
crashing or stalling — see `server/trading/kronosClient.ts`.
