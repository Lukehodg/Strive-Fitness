---
name: verify
description: Build, run and drive this trading platform to verify a change at its real surface (HTTP API + engine loop), including the Alpaca broker path.
---

# Verifying Auto-Trader

Surface is an Express server on **:5000** plus a background trading engine.
Drive it over HTTP; don't import-and-call the modules.

## Launch

```bash
npm install
setsid nohup npx tsx server/index.ts > /tmp/app.log 2>&1 < /dev/null &
sleep 8
curl -s localhost:5000/api/status
```

Use `setsid nohup ... < /dev/null &`. A plain `&` job dies when a later
`pkill` kills the shell (exit 144) and you lose the app mid-run.

Startup prints the data source unmissably — check it first:

```
market data: ALPACA (real prices) — endpoint <url>     |  SYNTHETIC (...)
orders: Alpaca PAPER account ...                       |  *** ALPACA LIVE — REAL MONEY ***
```

## Driving the Alpaca path without Alpaca

`api.alpaca.markets` is blocked from this environment. Point the app at a
local stand-in venue instead — this exercises the real broker code over real
HTTP:

```bash
printf 'ALPACA_KEY_ID=PK1\nALPACA_SECRET_KEY=s\nALPACA_BASE_URL=http://127.0.0.1:7788\n' > .env
```

The venue must serve `/v2/clock`, `/v2/account`, `/v2/positions/:sym`,
`POST /v2/orders`, `GET|DELETE /v2/orders/:id`. Fill non-stop orders
immediately so the engine progresses to placing its protective stop.
Market data still falls back to synthetic (the data host is hardcoded),
which is fine — orders and positions still flow through the mock.

`ALPACA_BASE_URL` is normalized, so a pasted `.../v2` works.

## Getting it to actually trade

Signals are rare on a single symbol. To see orders within ~40s:

```bash
curl -s -X POST localhost:5000/api/universes/crypto/apply      # 15 symbols
curl -s -X PATCH localhost:5000/api/config -H "Content-Type: application/json" \
  -d '{"mode":"live","intervalSeconds":5,"autoSelectStrategy":false,"activeStrategyId":"breakout"}'
curl -s -X POST localhost:5000/api/control/start
```

`mode: "live"` routes orders to Alpaca; `paper` uses the in-memory broker.
Config updates are **PATCH**, not POST.

## Reading the evidence

- `GET /api/decisions?limit=300` — the audit trail. Cross-check the symbol in
  each `BUY`/`SELL` line against what the venue received; multi-symbol
  misattribution has shipped here before.
- `GET /api/status`, `/api/equity`, `/api/trades`
- Reset between runs: `rm -f data/state.json` (paper balances persist).

## Worth probing

- Unknown universe id → 404 listing valid ids
- Venue rejecting a protective stop → `risk_block` + warning alert
- Market closed (`/v2/clock` false) → equities stand down, no orders sent
- Position/exposure limits → `risk_block` entries once full
