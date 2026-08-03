// Which selection settings actually survive out of sample?
//
//   npx tsx server/trading/selectionSweep.ts
//
// Sweeping settings and reporting the best one is the SAME selection bias this
// whole exercise is about: the best of N noisy configurations is mostly the
// luckiest of N. So the paths are split in half. Settings are ranked on the
// TRAIN half, the single winner is then run once on the VALIDATE half, and
// only that second number is allowed to mean anything.
//
// The gap between a config's train rank and its validate result IS the
// finding. A winner that collapses on validation is evidence that this kind of
// tuning does not generalise — which is worth knowing and is a perfectly
// legitimate outcome to report.

import { STRATEGY_LIST, type Strategy } from "./strategies";
import { backtestStrategy } from "./backtester";
import { selectStrategy } from "./aiSelector";
import { selectStrategyOOS, type OOSOptions } from "./selection";
import { generateSyntheticCandles } from "./marketData";
import type { Candle } from "@shared/schema";

const LOOKBACK = 600;
const HORIZON = 200;
const PATH_BARS = 6000;
const TRAIN_PATHS = 10;
const VALIDATE_PATHS = 10;
const WARM = 240;

function forwardReturn(strategy: Strategy, candles: Candle[], start: number, end: number): number {
  const from = Math.max(0, start - WARM);
  const result = backtestStrategy(strategy, candles.slice(from, end));
  const returns = result.returns ?? [];
  const offset = start - from - 35;
  if (offset < 0 || offset >= returns.length) return 0;
  let mult = 1;
  for (let i = offset; i < returns.length; i++) mult *= 1 + returns[i];
  return mult - 1;
}

type Picker = (h: Candle[], cur: string | undefined) => Strategy;

function runPolicy(pick: Picker, candles: Candle[]): { total: number; switches: number } {
  let equity = 1;
  let current: string | undefined;
  let switches = 0;
  for (let t = LOOKBACK; t + HORIZON <= candles.length; t += HORIZON) {
    const chosen = pick(candles.slice(t - LOOKBACK, t), current);
    if (current && chosen.meta.id !== current) switches++;
    current = chosen.meta.id;
    equity *= 1 + forwardReturn(chosen, candles, t, t + HORIZON);
  }
  return { total: equity - 1, switches };
}

const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;

function pairedT(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const d = Array.from({ length: n }, (_, i) => b[i] - a[i]);
  const m = mean(d);
  const v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return se > 0 ? m / se : 0;
}

const makePaths = (tag: string, n: number, offset: number) =>
  Array.from({ length: n }, (_, i) =>
    generateSyntheticCandles(`${tag}${i}`, PATH_BARS, Date.UTC(2026, 0, 15) + (offset + i) * 86_400_000),
  );

const trainPaths = makePaths("TRAIN", TRAIN_PATHS, 0);
const validatePaths = makePaths("VALID", VALIDATE_PATHS, 500);

// Settings to try. The hypothesis being tested is that the first version was
// too jittery: 3 folds over ~600 bars leaves only a handful of trades per
// fold, so the dispersion term measures noise and drives needless switching.
const configs: Array<{ name: string; opts: OOSOptions }> = [];
for (const folds of [1, 2, 3]) {
  for (const dispersionWeight of [0, 0.5]) {
    for (const margin of [4, 12]) {
      configs.push({
        name: `folds=${folds} disp=${dispersionWeight} margin=${margin}`,
        opts: { folds, shrinkK: 5, dispersionWeight, margin },
      });
    }
  }
}

console.log(
  `Selection sweep — ranked on ${TRAIN_PATHS} train paths, winner validated on ` +
  `${VALIDATE_PATHS} UNSEEN paths\n`,
);

const baselineTrain = trainPaths.map((p) => runPolicy((h, c) => selectStrategy(h, c).chosen, p).total);
console.log(`  CURRENT selector on train: ${(mean(baselineTrain) * 100).toFixed(2)}%\n`);

console.log("  config                              train    switches");
console.log("  " + "-".repeat(52));
const trainResults = configs.map((cfg) => {
  const runs = trainPaths.map((p) => runPolicy((h, c) => selectStrategyOOS(h, c, cfg.opts).chosen, p));
  const totals = runs.map((r) => r.total);
  console.log(
    `  ${cfg.name.padEnd(34)} ${(mean(totals) * 100).toFixed(2).padStart(7)}% ` +
    `${mean(runs.map((r) => r.switches)).toFixed(1).padStart(8)}`,
  );
  return { cfg, totals, mean: mean(totals) };
});

const winner = trainResults.reduce((a, b) => (b.mean > a.mean ? b : a));
console.log(`\n  train winner: ${winner.cfg.name} (${(winner.mean * 100).toFixed(2)}%)`);

// --- the only number that counts ---------------------------------------------
console.log(`\n  === VALIDATE on ${VALIDATE_PATHS} unseen paths ===`);
const valWinner = validatePaths.map((p) => runPolicy((h, c) => selectStrategyOOS(h, c, winner.cfg.opts).chosen, p).total);
const valCurrent = validatePaths.map((p) => runPolicy((h, c) => selectStrategy(h, c).chosen, p).total);

// Best fixed strategy on the validation paths, chosen with hindsight.
const fixedVal = STRATEGY_LIST.map((s) => ({
  name: s.meta.name,
  totals: validatePaths.map((p) => runPolicy(() => s, p).total),
}));
const bestFixed = fixedVal.reduce((a, b) => (mean(b.totals) > mean(a.totals) ? b : a));

console.log(`  tuned OOS (${winner.cfg.name})`.padEnd(46) + `${(mean(valWinner) * 100).toFixed(2).padStart(7)}%`);
console.log(`  CURRENT selector`.padEnd(46) + `${(mean(valCurrent) * 100).toFixed(2).padStart(7)}%`);
console.log(`  best fixed: ${bestFixed.name} (hindsight)`.padEnd(46) + `${(mean(bestFixed.totals) * 100).toFixed(2).padStart(7)}%`);

const cmp = (label: string, a: number[], b: number[]) => {
  const diff = mean(b) - mean(a);
  const t = pairedT(a, b);
  console.log(
    `  ${label.padEnd(34)} ${(diff * 100 >= 0 ? "+" : "")}${(diff * 100).toFixed(2)}pp  t=${t.toFixed(2)}  ` +
    `${Math.abs(t) < 2.26 ? "within noise" : diff > 0 ? "BETTER" : "WORSE"}`,
  );
};

console.log(`\n  paired on the validation paths (|t| > 2.26 clears noise at n=10):`);
cmp("tuned OOS vs CURRENT", valCurrent, valWinner);
cmp("CURRENT vs best fixed", bestFixed.totals, valCurrent);
cmp("tuned OOS vs best fixed", bestFixed.totals, valWinner);
