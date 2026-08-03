// How much hysteresis should the selector have?
//
//   npx tsx server/trading/marginEval.ts
//
// The sweep in selectionSweep.ts found that the scoring changes it was testing
// barely mattered, while SWITCH_MARGIN — how far ahead a challenger must be
// before the engine actually switches — dominated everything. Every low-margin
// configuration switched 8-11 times and returned 30-66%; every high-margin one
// switched under 1.5 times and returned 76-88%, regardless of how the scores
// were computed.
//
// That is a claim about switching COST and estimate NOISE rather than about
// which strategy is good, so it is the kind of finding most likely to carry
// over to real data. This isolates it on the existing selector, ranked on
// train paths and confirmed on unseen ones.

import { STRATEGY_LIST, type Strategy } from "./strategies";
import { backtestStrategy } from "./backtester";
import { selectStrategy } from "./aiSelector";
import { generateSyntheticCandles } from "./marketData";
import type { Candle } from "@shared/schema";

const LOOKBACK = 600;
const HORIZON = 200;
const PATH_BARS = 6000;
const WARM = 240;
const N = 10;

function forwardReturn(strategy: Strategy, candles: Candle[], start: number, end: number): number {
  const from = Math.max(0, start - WARM);
  const returns = backtestStrategy(strategy, candles.slice(from, end)).returns ?? [];
  const offset = start - from - 35;
  if (offset < 0 || offset >= returns.length) return 0;
  let mult = 1;
  for (let i = offset; i < returns.length; i++) mult *= 1 + returns[i];
  return mult - 1;
}

function run(margin: number, candles: Candle[]): { total: number; switches: number } {
  let equity = 1;
  let current: string | undefined;
  let switches = 0;
  for (let t = LOOKBACK; t + HORIZON <= candles.length; t += HORIZON) {
    const chosen = selectStrategy(candles.slice(t - LOOKBACK, t), current, margin).chosen;
    if (current && chosen.meta.id !== current) switches++;
    current = chosen.meta.id;
    equity *= 1 + forwardReturn(chosen, candles, t, t + HORIZON);
  }
  return { total: equity - 1, switches };
}

const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;

function pairedT(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const d = Array.from({ length: n }, (_, i) => b[i] - a[i]);
  const m = mean(d);
  const v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return se > 0 ? m / se : 0;
}

const paths = (tag: string, off: number) =>
  Array.from({ length: N }, (_, i) =>
    generateSyntheticCandles(`${tag}${i}`, PATH_BARS, Date.UTC(2026, 0, 15) + (off + i) * 86_400_000),
  );

const train = paths("TRAIN", 0);
const validate = paths("VALID", 500);
const MARGINS = [4, 8, 12, 20, 40];

console.log(`Switch margin on the EXISTING selector — ${N} train / ${N} unseen validate paths\n`);
console.log("  margin     train   switches      validate   switches");
console.log("  " + "-".repeat(54));

const results: Array<{ margin: number; val: number[] }> = [];
for (const m of MARGINS) {
  const tr = train.map((p) => run(m, p));
  const va = validate.map((p) => run(m, p));
  results.push({ margin: m, val: va.map((r) => r.total) });
  console.log(
    `  ${String(m).padStart(6)} ${(mean(tr.map((r) => r.total)) * 100).toFixed(2).padStart(8)}% ` +
    `${mean(tr.map((r) => r.switches)).toFixed(1).padStart(8)} ` +
    `${(mean(va.map((r) => r.total)) * 100).toFixed(2).padStart(12)}% ` +
    `${mean(va.map((r) => r.switches)).toFixed(1).padStart(8)}`,
  );
}

const fixed = STRATEGY_LIST.map((s) => ({
  name: s.meta.name,
  val: validate.map((p) => {
    let equity = 1;
    for (let t = LOOKBACK; t + HORIZON <= p.length; t += HORIZON) {
      equity *= 1 + forwardReturn(s, p, t, t + HORIZON);
    }
    return equity - 1;
  }),
}));
const best = fixed.reduce((a, b) => (mean(b.val) > mean(a.val) ? b : a));
console.log("  " + "-".repeat(54));
console.log(`  best fixed (hindsight): ${best.name}  ${(mean(best.val) * 100).toFixed(2)}%`);

const current = results.find((r) => r.margin === 4)!;
console.log(`\n  paired vs the shipped margin of 4, on validation paths:`);
for (const r of results) {
  if (r.margin === 4) continue;
  const t = pairedT(current.val, r.val);
  const d = mean(r.val) - mean(current.val);
  console.log(
    `    margin ${String(r.margin).padStart(2)}  ${(d * 100 >= 0 ? "+" : "")}${(d * 100).toFixed(2)}pp  ` +
    `t=${t.toFixed(2)}  ${Math.abs(t) < 2.26 ? "within noise" : d > 0 ? "BETTER" : "WORSE"}`,
  );
}
const bestMargin = results.reduce((a, b) => (mean(b.val) > mean(a.val) ? b : a));
console.log(
  `\n    vs best fixed, at margin ${bestMargin.margin}: ` +
  `${((mean(bestMargin.val) - mean(best.val)) * 100).toFixed(2)}pp  ` +
  `t=${pairedT(best.val, bestMargin.val).toFixed(2)}`,
);
