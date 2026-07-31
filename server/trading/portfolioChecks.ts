// Portfolio-limit checks. Run with: npx tsx server/trading/portfolioChecks.ts
//
// These pin down the rules that stop multi-symbol trading from quietly taking
// far more risk than single-symbol trading did.

import { correlation, returnsOf, vetPortfolioEntry, type PortfolioLimits } from "./portfolio";
import { PaperBroker } from "./brokers";
import type { Candle } from "@shared/schema";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const LIMITS: PortfolioLimits = {
  maxConcurrentPositions: 3,
  maxTotalExposurePct: 0.6,
  maxCorrelatedExposurePct: 0.35,
};

function candles(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ time: i * 60_000, open: c, high: c, low: c, close: c, volume: 1 }));
}

async function main() {
  // --- correlation ---------------------------------------------------------
  // Build from an irregular path: a smooth ramp produces monotone RETURNS, so
  // even an "opposite" ramp correlates +1 on returns. Correlation here is of
  // returns, not prices, so the test data has to vary in both directions.
  const wiggles = [0.01, -0.02, 0.03, -0.01, 0.02, -0.03, 0.015];
  const toPath = (rets: number[]) =>
    rets.reduce<number[]>((path, r) => [...path, path[path.length - 1] * (1 + r)], [100]);

  const up = returnsOf(candles(toPath(wiggles)));
  const alsoUp = returnsOf(candles(toPath(wiggles)));
  const mirrored = returnsOf(candles(toPath(wiggles.map((r) => -r))));
  check("identical shape correlates ~+1", correlation(up, alsoUp) > 0.99, `${correlation(up, alsoUp).toFixed(3)}`);
  check("mirrored returns correlate ~-1", correlation(up, mirrored) < -0.99, `${correlation(up, mirrored).toFixed(3)}`);
  check("too few points -> 0", correlation([0.1], [0.2]) === 0);
  check("flat series -> 0 (no variance)", correlation([0, 0, 0, 0], [0.1, 0.2, 0.3, 0.4]) === 0);

  // --- position count ------------------------------------------------------
  const three = [
    { symbol: "A", notional: 100 },
    { symbol: "B", notional: 100 },
    { symbol: "C", notional: 100 },
  ];
  check("blocked at the concurrent-position limit",
    vetPortfolioEntry("D", 10_000, three, {}, LIMITS, 1000).allowed === false);
  check("already-held symbol refused",
    vetPortfolioEntry("A", 10_000, three, {}, LIMITS, 1000).allowed === false);

  // --- total exposure ------------------------------------------------------
  const heavy = [{ symbol: "A", notional: 5900 }];
  const capped = vetPortfolioEntry("B", 10_000, heavy, { A: 0 }, LIMITS, 1000);
  check("total exposure ceiling trims the trade",
    capped.allowed && Math.abs(capped.maxNotional - 100) < 1e-6,
    `maxNotional=${capped.maxNotional}`);
  const full = vetPortfolioEntry("B", 10_000, [{ symbol: "A", notional: 6000 }], { A: 0 }, LIMITS, 1000);
  check("no room at the total ceiling", full.allowed === false, full.reason);

  // --- correlation-weighted exposure: THE point of this module -------------
  const held = [{ symbol: "BTC/USD", notional: 3000 }]; // 30% of equity

  const twin = vetPortfolioEntry("ETH/USD", 10_000, held, { "BTC/USD": 0.95 }, LIMITS, 2000);
  check("near-duplicate of an existing holding is throttled",
    twin.allowed && twin.maxNotional < 700,
    `maxNotional=${twin.maxNotional.toFixed(0)} (35% cap - 0.95*3000 already used)`);

  const unrelated = vetPortfolioEntry("AAPL", 10_000, held, { "BTC/USD": 0.05 }, LIMITS, 2000);
  check("genuinely uncorrelated candidate gets full size",
    unrelated.allowed && Math.abs(unrelated.maxNotional - 2000) < 1e-6,
    `maxNotional=${unrelated.maxNotional.toFixed(0)}`);
  check("uncorrelated allowed far more than correlated",
    unrelated.maxNotional > twin.maxNotional * 3);

  // Long/flat-only: an inverse correlation is NOT a hedge, so |r| is used.
  const inverse = vetPortfolioEntry("SHORTY", 10_000, held, { "BTC/USD": -0.95 }, LIMITS, 2000);
  check("strong NEGATIVE correlation throttled too (long/flat only)",
    inverse.allowed && Math.abs(inverse.maxNotional - twin.maxNotional) < 1e-6,
    `maxNotional=${inverse.maxNotional.toFixed(0)}`);

  const saturated = vetPortfolioEntry("ETH/USD", 10_000, [{ symbol: "BTC/USD", notional: 3600 }],
    { "BTC/USD": 1.0 }, LIMITS, 1000);
  check("fully saturated correlated bucket blocks entirely",
    saturated.allowed === false, saturated.reason);

  // Unknown correlation must be treated as fully correlated (conservative).
  const unknown = vetPortfolioEntry("MYSTERY", 10_000, held, { "BTC/USD": 1 }, LIMITS, 2000);
  check("unknown correlation treated conservatively",
    unknown.maxNotional < 700, `maxNotional=${unknown.maxNotional.toFixed(0)}`);

  check("zero equity refused", vetPortfolioEntry("A", 0, [], {}, LIMITS, 100).allowed === false);

  // --- broker: multi-symbol valuation --------------------------------------
  {
    const b = new PaperBroker(10_000);
    await b.submitOrder({ symbol: "BTC/USD", side: "buy", qty: 0.05 }, 60_000); // ~3000
    await b.submitOrder({ symbol: "AAPL", side: "buy", qty: 10 }, 200); // ~2000
    b.mark("BTC/USD", 60_000);
    b.mark("AAPL", 200);
    const acct = await b.getAccount();
    // Each position valued at its OWN mark, not one shared price.
    check("multi-symbol equity values each position at its own mark",
      Math.abs(acct.positionsValue - (0.05 * 60_000 + 10 * 200)) < 1,
      `positionsValue=${acct.positionsValue.toFixed(2)} (expected ~5000)`);
    check("equity is cash + positions",
      Math.abs(acct.equity - (acct.cash + acct.positionsValue)) < 1e-6);
  }

  // --- broker: resting orders settle against their OWN symbol's bar --------
  {
    const b = new PaperBroker(10_000);
    await b.submitOrder({ symbol: "BTC/USD", side: "buy", qty: 0.01, limitOffsetPct: 0.001 }, 60_000);
    await b.submitOrder({ symbol: "AAPL", side: "buy", qty: 5, limitOffsetPct: 0.001 }, 200);

    // Only BTC's bar reaches its limit. AAPL's bar does not.
    const settled = b.resolvePending({
      "BTC/USD": { high: 60_100, low: 59_000, close: 60_000 },
      AAPL: { high: 201, low: 199.9, close: 200 },
    });
    const btc = settled.find((o) => o.symbol === "BTC/USD");
    const aapl = settled.find((o) => o.symbol === "AAPL");
    check("BTC limit filled from BTC's own bar", btc?.status === "filled", `status=${btc?.status}`);
    check("AAPL limit not filled from BTC's move", aapl?.status === "rejected", `status=${aapl?.status}`);
    check("only BTC position opened", (await b.getPosition("BTC/USD")) !== null);
    check("no AAPL position", (await b.getPosition("AAPL")) === null);
  }

  // A symbol with no bar this tick must keep resting, not be settled blind.
  {
    const b = new PaperBroker(10_000);
    await b.submitOrder({ symbol: "AAPL", side: "buy", qty: 5, limitOffsetPct: 0.001 }, 200);
    const settled = b.resolvePending({ "BTC/USD": { high: 60_100, low: 1, close: 60_000 } });
    check("order for an absent symbol is left resting, not settled", settled.length === 0,
      `settled=${settled.length}`);
    const later = b.resolvePending({ AAPL: { high: 201, low: 100, close: 200 } });
    check("it settles once its own bar arrives", later[0]?.status === "filled", `status=${later[0]?.status}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures ? 1 : 0);
}

main();
