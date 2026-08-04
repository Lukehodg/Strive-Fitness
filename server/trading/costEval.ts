// What does the corrected cost model actually change?
//
//   npx tsx server/trading/costEval.ts
//
// The old model charged 0.10% taker / 0.02% maker to EVERYTHING — crypto and
// equities alike — from flat constants in execution.ts, while a per-asset
// feeRatesFor() sat in assets.ts that nothing called. This re-prices the same
// strategies on the same bars under both models so the size of that error is a
// number rather than an assertion.
//
// The comparison that matters is not "returns went down". It is whether a
// strategy's edge survives being charged what trading actually costs. A result
// that only exists at 0.10% taker was never real.

import { STRATEGY_LIST } from "./strategies";
import { backtestStrategy, type BacktestSizing } from "./backtester";
import { generateSyntheticCandles } from "./marketData";
import { setCostOverrides, ratesFor, roundTripCost, DEFAULT_RATES } from "./costs";
import { TRADING_PROFILES } from "./universes";

const PATHS = 10;
const BARS = 6000;

/** The model as it was before this change: one flat rate for every asset. */
const OLD = { cryptoTakerFee: 0.001, cryptoMakerFee: 0.0002, equityTakerFee: 0.001, equityMakerFee: 0.0002 };
/** The corrected model: per asset class, defaults from costs.ts. */
const NEW = {};

const paths = Array.from({ length: PATHS }, (_, i) =>
  generateSyntheticCandles(`COST${i}`, BARS, Date.UTC(2026, 0, 15) + i * 86_400_000),
);

const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;

function sizingFor(symbol: string, offset: number, makerOnly: boolean): BacktestSizing {
  return {
    maxPositionPct: 0.25,
    adaptive: false,
    volTargetPct: 0.004,
    kellyFraction: 0.5,
    limitOrderOffsetPct: offset,
    symbol,
    makerOnlyEntries: makerOnly,
  };
}

function runAll(symbol: string, offset: number, makerOnly: boolean, stop: number, target: number) {
  return STRATEGY_LIST.map((s) => ({
    name: s.meta.name,
    ret: mean(paths.map((p) => backtestStrategy(s, p, 10_000, stop, target, sizingFor(symbol, offset, makerOnly)).returnPct)),
    trades: mean(paths.map((p) => backtestStrategy(s, p, 10_000, stop, target, sizingFor(symbol, offset, makerOnly)).stats.totalTrades)),
  }));
}

// --- 1. What a round trip costs ---------------------------------------------
console.log("Round-trip execution cost\n");
console.log("  asset    style    OLD model    CORRECTED    error");
console.log("  " + "-".repeat(56));
for (const [sym, label] of [["BTC/USD", "crypto"], ["AAPL", "stock "]] as const) {
  for (const maker of [false, true]) {
    setCostOverrides(OLD);
    const oldCost = roundTripCost(sym, maker);
    setCostOverrides(NEW);
    const newCost = roundTripCost(sym, maker);
    console.log(
      `  ${label}   ${maker ? "maker" : "taker"}    ${(oldCost * 100).toFixed(3)}%       ` +
      `${(newCost * 100).toFixed(3)}%      ${newCost > oldCost ? "+" : ""}${((newCost - oldCost) * 100).toFixed(3)}pp`,
    );
  }
}

// --- 2. Cost as a share of the profit target ---------------------------------
console.log("\nCost as a share of the take-profit target (the number that decides");
console.log("whether a configuration can work at all):\n");
setCostOverrides(NEW);
for (const profile of TRADING_PROFILES) {
  const target = profile.config.takeProfitPct ?? 0.06;
  const taker = roundTripCost("BTC/USD", false);
  const maker = roundTripCost("BTC/USD", true);
  console.log(
    `  ${profile.name.padEnd(16)} target ${(target * 100).toFixed(1)}%  ` +
    `taker eats ${((taker / target) * 100).toFixed(0)}%  maker eats ${((maker / target) * 100).toFixed(0)}%`,
  );
}

// --- 3. Re-price the strategies ----------------------------------------------
console.log("\n\nSame strategies, same bars, re-priced (crypto, swing settings)\n");
console.log("  strategy                    OLD cost    CORRECTED     delta   trades");
console.log("  " + "-".repeat(66));
setCostOverrides(OLD);
const oldRes = runAll("BTC/USD", 0.0006, false, 0.03, 0.06);
setCostOverrides(NEW);
const newRes = runAll("BTC/USD", 0.0006, false, 0.03, 0.06);
for (let i = 0; i < oldRes.length; i++) {
  console.log(
    `  ${oldRes[i].name.padEnd(26)} ${(oldRes[i].ret * 100).toFixed(2).padStart(8)}% ` +
    `${(newRes[i].ret * 100).toFixed(2).padStart(11)}% ` +
    `${((newRes[i].ret - oldRes[i].ret) * 100).toFixed(2).padStart(8)}pp ` +
    `${newRes[i].trades.toFixed(0).padStart(7)}`,
  );
}

// --- 4. The day-trading profile, where turnover is highest --------------------
console.log("\n\nDay-trading settings (1.5% target, tight stop) — highest turnover\n");
console.log("  strategy                    OLD cost    CORRECTED     delta   trades");
console.log("  " + "-".repeat(66));
setCostOverrides(OLD);
const oldDay = runAll("BTC/USD", 0.0006, false, 0.01, 0.015);
setCostOverrides(NEW);
const newDay = runAll("BTC/USD", 0.0006, false, 0.01, 0.015);
for (let i = 0; i < oldDay.length; i++) {
  console.log(
    `  ${oldDay[i].name.padEnd(26)} ${(oldDay[i].ret * 100).toFixed(2).padStart(8)}% ` +
    `${(newDay[i].ret * 100).toFixed(2).padStart(11)}% ` +
    `${((newDay[i].ret - oldDay[i].ret) * 100).toFixed(2).padStart(8)}pp ` +
    `${newDay[i].trades.toFixed(0).padStart(7)}`,
  );
}

// --- 5. Maker-only entries ----------------------------------------------------
console.log("\n\nMaker-only entries, under the corrected model (crypto, swing)\n");
console.log("  strategy                  maker-first   maker-ONLY     delta   trades m-only");
console.log("  " + "-".repeat(76));
setCostOverrides(NEW);
const firstRes = runAll("BTC/USD", 0.0006, false, 0.03, 0.06);
const onlyRes = runAll("BTC/USD", 0.0006, true, 0.03, 0.06);
for (let i = 0; i < firstRes.length; i++) {
  console.log(
    `  ${firstRes[i].name.padEnd(24)} ${(firstRes[i].ret * 100).toFixed(2).padStart(10)}% ` +
    `${(onlyRes[i].ret * 100).toFixed(2).padStart(12)}% ` +
    `${((onlyRes[i].ret - firstRes[i].ret) * 100).toFixed(2).padStart(8)}pp ` +
    `${onlyRes[i].trades.toFixed(0).padStart(12)}`,
  );
}
console.log(
  "\n  Note: with limitOrderOffsetPct > 0 the paper broker ALREADY cancels an\n" +
  "  unfilled entry rather than crossing, so maker-only changes little here.\n" +
  "  Where it bites is live equities: an order under one share cannot be a\n" +
  "  limit at Alpaca, so on a small account every equity entry crossed the\n" +
  "  spread regardless of the offset. That path is not reachable in a\n" +
  "  synthetic backtest — it is a live-broker behaviour.",
);
