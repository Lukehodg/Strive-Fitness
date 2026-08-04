// How wide should the profit target be, once costs are priced correctly?
//
//   npx tsx server/trading/turnoverEval.ts
//
// costEval.ts showed a taker round trip on crypto is 0.60%, and the day
// profile's take-profit target is 1.5% — so 40% of the gross target is spent
// on execution before the trade is even right. That is not a tuning detail,
// it is the dominant term.
//
// This sweeps the target (and the stop with it) to find where the profile
// stops fighting its own costs. Ranked on train paths, confirmed on unseen
// ones, because picking the best cell of a sweep is the same selection bias
// that has already bitten twice in this project.

import { STRATEGY_LIST } from "./strategies";
import { backtestStrategy, type BacktestSizing } from "./backtester";
import { generateSyntheticCandles } from "./marketData";
import { setCostOverrides, roundTripCost } from "./costs";

const BARS = 6000;
const N = 8;

setCostOverrides({}); // corrected defaults

const train = Array.from({ length: N }, (_, i) =>
  generateSyntheticCandles(`TURN${i}`, BARS, Date.UTC(2026, 0, 15) + i * 86_400_000));
const validate = Array.from({ length: N }, (_, i) =>
  generateSyntheticCandles(`TVAL${i}`, BARS, Date.UTC(2026, 0, 15) + (i + 700) * 86_400_000));

const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;

const sizing: BacktestSizing = {
  maxPositionPct: 0.1,
  adaptive: false,
  volTargetPct: 0.004,
  kellyFraction: 0.5,
  limitOrderOffsetPct: 0.0006,
  symbol: "BTC/USD",
  makerOnlyEntries: false,
};

/** Best strategy's mean return at a given stop/target, plus turnover. */
function evaluate(paths: ReturnType<typeof generateSyntheticCandles>[], stop: number, target: number) {
  const perStrategy = STRATEGY_LIST.map((s) => {
    const runs = paths.map((p) => backtestStrategy(s, p, 10_000, stop, target, sizing));
    return { ret: mean(runs.map((r) => r.returnPct)), trades: mean(runs.map((r) => r.stats.totalTrades)) };
  });
  // Report the best available strategy, since that is what a selector aims at.
  const best = perStrategy.reduce((a, b) => (b.ret > a.ret ? b : a));
  return best;
}

const cost = roundTripCost("BTC/USD", false);
console.log(`Taker round trip on crypto: ${(cost * 100).toFixed(3)}%\n`);
console.log("Day-trading profile — how wide does the target need to be?\n");
console.log("  stop/target    cost as % of target    train      validate   trades");
console.log("  " + "-".repeat(70));

const grid: Array<[number, number]> = [
  [0.01, 0.015],  // current day profile
  [0.01, 0.02],
  [0.015, 0.025],
  [0.015, 0.03],
  [0.02, 0.04],
  [0.03, 0.06],   // swing profile, for reference
];

const rows = grid.map(([stop, target]) => {
  const tr = evaluate(train, stop, target);
  const va = evaluate(validate, stop, target);
  console.log(
    `  ${(stop * 100).toFixed(1)}% / ${(target * 100).toFixed(1)}%` .padEnd(15) +
    `${((cost / target) * 100).toFixed(0)}%`.padStart(14) +
    `${(tr.ret * 100).toFixed(2).padStart(15)}%` +
    `${(va.ret * 100).toFixed(2).padStart(12)}%` +
    `${va.trades.toFixed(0).padStart(9)}`,
  );
  return { stop, target, train: tr.ret, validate: va.ret, trades: va.trades };
});

const bestTrain = rows.reduce((a, b) => (b.train > a.train ? b : a));
const current = rows[0];
console.log("  " + "-".repeat(70));
console.log(
  `\n  train winner: ${(bestTrain.stop * 100).toFixed(1)}%/${(bestTrain.target * 100).toFixed(1)}% ` +
  `-> validates at ${(bestTrain.validate * 100).toFixed(2)}%`,
);
console.log(
  `  current day profile (1.0%/1.5%) validates at ${(current.validate * 100).toFixed(2)}% ` +
  `with ${current.trades.toFixed(0)} trades`,
);
console.log(
  `\n  difference on unseen paths: ${((bestTrain.validate - current.validate) * 100).toFixed(2)}pp, ` +
  `and ${(current.trades - bestTrain.trades).toFixed(0)} fewer round trips to pay for.`,
);
