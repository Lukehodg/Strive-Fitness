---
name: verify
description: Build, run and drive this trading platform to verify a change at its real surface (HTTP API + engine loop), including the OANDA broker path.
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
market data: OANDA (real FX prices) — endpoint <url>   |  SYNTHETIC (...)
orders: OANDA PRACTICE account ...                     |  *** OANDA LIVE — REAL MONEY ***
```

## Driving the OANDA path without OANDA

`api-fxpractice.oanda.com` is not reachable from this environment. Point the
app at a local stand-in venue instead — this exercises the real broker code
over real HTTP:

```bash
printf 'OANDA_API_TOKEN=t\nOANDA_ACCOUNT_ID=001-001-1-001\nOANDA_BASE_URL=http://127.0.0.1:7799\n' > .env
```

The venue must serve, under `/v3/accounts/:id/`: `summary`, `openPositions`,
`POST orders`, `PUT orders/:id/cancel`, and `/v3/instruments/:inst/candles`.
Fill MARKET orders immediately (return an `orderFillTransaction`) so the engine
progresses to placing its protective stop; acknowledge LIMIT and STOP orders
with an `orderCreateTransaction` instead.

`OANDA_BASE_URL` is normalized, so a pasted `.../v3` works.

**Check the wire format, not just the outcome.** Three things are easy to get
backwards and none of them throws:

- **Units are signed.** There is no `side` field. Buying `EUR/USD` must send
  `EUR_USD +units`; buying `JPY/USD` must send `USD_JPY -units`, because long
  JPY/USD is short USD/JPY.
- **Instruments are always conventional.** `USD_JPY` exists; `JPY_USD` does not.
- **Stops invert too.** A stop *below* entry in JPY/USD is *above* it in
  USD/JPY, and closing a long here is a BUY at the venue.

## FX is closed at weekends

The engine correctly stands down Saturday and Sunday, so a weekend run produces
`Market closed for EUR/USD, …` and zero orders. That is the session logic
working, not a failure — but it means the trading path cannot be exercised
end-to-end until Sunday 17:00 ET. To verify the adapter itself outside those
hours, drive `OandaBroker` directly against the mock venue.

## Getting it to actually trade

Signals are rare on a single symbol. To see orders within ~40s:

```bash
curl -s -X POST localhost:5000/api/universes/majors/apply      # 7 pairs
curl -s -X PATCH localhost:5000/api/config -H "Content-Type: application/json" \
  -d '{"mode":"live","intervalSeconds":5,"autoSelectStrategy":false,"activeStrategyId":"breakout","requireProvenEdge":false}'
curl -s -X POST localhost:5000/api/control/start
```

`mode: "live"` routes orders to OANDA; `paper` uses the in-memory broker.
Config updates are **PATCH**, not POST.

`requireProvenEdge` defaults to **true** and blocks every live entry until a
strategy has 30 realised trades with positive expectancy — so without turning
it off you will see zero orders and a `LIVE entries blocked` line. That is the
gate working; turn it off deliberately when verifying the order path.

## Reading the evidence

- `GET /api/decisions?limit=300` — the audit trail. Cross-check the symbol in
  each `BUY`/`SELL` line against what the venue received; multi-symbol
  misattribution has shipped here before.
- `GET /api/status`, `/api/equity`, `/api/trades`
- Reset between runs: `rm -f data/state.json` (paper balances persist).

## Worth probing

- Unknown universe id → 404 listing valid ids (`majors, tightest, eurusd`)
- Venue rejecting a protective stop → `risk_block` + warning alert
- Weekend / outside 24/5 → all pairs stand down, no orders sent
- Position/exposure limits → `risk_block` entries once full
- A cross like `GBP/JPY` → rejected with a "not a tradeable FX pair" message
- Confidence governor → compare `Sized to N% of equity` with the governor on
  vs off; the ratio should match `1 / sizeMultiplier` from `/api/confidence`
