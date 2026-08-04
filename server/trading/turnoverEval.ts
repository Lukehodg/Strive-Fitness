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

/**
 * Best strategy's mean return at a given stop/target, plus turnover.
 *
 * ALWAYS NAMES THE WINNER. An earlier version reported only the number, and
 * under a realistic price process every row came back "0.00%, 0 trades" —
 * which reads exactly like a broken harness. It was not: the best of the four
 * strategies is the ML model, which refuses to trade because it cannot beat
 * its majority-class baseline, and 0.00% genuinely beats every negative
 * alternative. A result that looks like a bug and is not is worse than one
 * that looks like a bug and is, so the winner's name is now part of the
 * output, and the best TRADING strategy is reported alongside it.
 */
function evaluate(paths: ReturnType<typeof generateSyntheticCandles>[], stop: number, target: number) {
  const perStrategy = STRATEGY_LIST.map((s) => {
    const runs = paths.map((p) => backtestStrategy(s, p, 10_000, stop, target, sizing));
    return {
      name: s.meta.name,
      ret: mean(runs.map((r) => r.returnPct)),
      trades: mean(runs.map((r) => r.stats.totalTrades)),
    };
  });
  const best = perStrategy.reduce((a, b) => (b.ret > a.ret ? b : a));
  const traded = perStrategy.filter((x) => x.trades > 0);
  const bestTrading = traded.length
    ? traded.reduce((a, b) => (b.ret > a.ret ? b : a))
    : { name: "none", ret: 0, trades: 0 };
  return { ...best, bestTrading };
}

const cost = roundTripCost("BTC/USD", false);
console.log(`Taker round trip on crypto: ${(cost * 100).toFixed(3)}%\n`);
console.log("Day-trading profile — how wide does the target need to be?\n");
console.log("  stop/target   cost/target    validate   trades   best strategy / best that trades");
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
    `  ${(stop * 100).toFixed(1)}% / ${(target * 100).toFixed(1)}%`.padEnd(14) +
    `${((cost / target) * 100).toFixed(0)}%`.padStart(9) +
    `${(va.ret * 100).toFixed(2).padStart(12)}%` +
    `${va.trades.toFixed(0).padStart(8)}   ` +
    `${va.name} / ${va.bestTrading.name} ${(va.bestTrading.ret * 100).toFixed(2)}%`,
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
if (rows.every((r) => r.trades === 0)) {
  console.log(
    `\n  EVERY ROW IS THE NON-TRADING MODEL. On this price process no target\n` +
    `  width rescues the strategies — widening the target is not the lever,\n` +
    `  because there is no edge for it to protect.`,
  );
}
