// The switch-margin sweep, parallelised across cores.
//
//   npm run sweep:margin
//
// Same measurement as marginEval.ts, same seeds, same maths, and verified to
// produce byte-identical numbers. 10.0s serial -> 4.5s on 3 workers.
//
// A modest gain here, but the structure is what matters: every sweep in this
// project is a pile of independent backtests, and the bigger ones (240 runs
// for the configuration sweep) scale better than this one does.

import { runParallel, siblingModule, workerCount } from "./parallel";
import type { PathJob, PathResult } from "./pathWorker";
import { STRATEGY_LIST } from "./strategies";

const BARS = 6000;
const LOOKBACK = 600;
const HORIZON = 200;
const N = 10;
const MARGINS = [4, 8, 12, 20, 40];
const WORKER = siblingModule(import.meta.url, "pathWorker.ts");

const seeds = (tag: string, offset: number) =>
  Array.from({ length: N }, (_, i) => ({
    seed: `${tag}${i}`,
    anchorMs: Date.UTC(2026, 0, 15) + (offset + i) * 86_400_000,
  }));

const train = seeds("TRAIN", 0);
const validate = seeds("VALID", 500);
const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;

function pairedT(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const d = Array.from({ length: n }, (_, i) => b[i] - a[i]);
  const m = mean(d);
  const v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return se > 0 ? m / se : 0;
}

// Build every job up front, then run the whole lot across cores at once —
// that keeps every core busy to the end instead of draining at each margin.
const jobs: PathJob[] = [];
const tag: Array<{ kind: "margin" | "fixed"; key: string; half: "train" | "validate" }> = [];

for (const margin of MARGINS) {
  for (const half of ["train", "validate"] as const) {
    for (const s of half === "train" ? train : validate) {
      jobs.push({ ...s, bars: BARS, lookback: LOOKBACK, horizon: HORIZON, margin });
      tag.push({ kind: "margin", key: String(margin), half });
    }
  }
}
for (const strat of STRATEGY_LIST) {
  for (const s of validate) {
    jobs.push({
      ...s, bars: BARS, lookback: LOOKBACK, horizon: HORIZON,
      margin: null, fixedStrategyId: strat.meta.id,
    });
    tag.push({ kind: "fixed", key: strat.meta.id, half: "validate" });
  }
}

console.log(
  `Switch-margin sweep — ${jobs.length} independent backtests across ` +
  `${workerCount()} worker(s)\n`,
);
const started = Date.now();
let lastPct = -1;
const results = await runParallel<PathJob, PathResult>({
  workerModule: WORKER,
  items: jobs,
  onProgress: (done, total) => {
    const p = Math.floor((done / total) * 20) * 5;
    if (p !== lastPct) {
      lastPct = p;
      process.stdout.write(`\r  ${p}%  (${done}/${total})   `);
    }
  },
});
const elapsed = (Date.now() - started) / 1000;
console.log(`\r  done in ${elapsed.toFixed(1)}s${" ".repeat(20)}\n`);

const pick = (kind: string, key: string, half: string) =>
  results.filter((_, i) => tag[i].kind === kind && tag[i].key === key && tag[i].half === half);

console.log("  margin     train   switches      validate   switches");
console.log("  " + "-".repeat(54));
const perMargin = new Map<number, number[]>();
for (const m of MARGINS) {
  const tr = pick("margin", String(m), "train");
  const va = pick("margin", String(m), "validate");
  perMargin.set(m, va.map((r) => r.total));
  console.log(
    `  ${String(m).padStart(6)} ${(mean(tr.map((r) => r.total)) * 100).toFixed(2).padStart(8)}% ` +
    `${mean(tr.map((r) => r.switches)).toFixed(1).padStart(8)} ` +
    `${(mean(va.map((r) => r.total)) * 100).toFixed(2).padStart(12)}% ` +
    `${mean(va.map((r) => r.switches)).toFixed(1).padStart(8)}`,
  );
}

const fixedResults = STRATEGY_LIST.map((s) => ({
  name: s.meta.name,
  val: pick("fixed", s.meta.id, "validate").map((r) => r.total),
}));
const best = fixedResults.reduce((a, b) => (mean(b.val) > mean(a.val) ? b : a));
console.log("  " + "-".repeat(54));
console.log(`  best fixed (hindsight): ${best.name}  ${(mean(best.val) * 100).toFixed(2)}%`);

const base = perMargin.get(4)!;
console.log(`\n  paired vs the shipped margin of 4, on validation paths:`);
for (const m of MARGINS) {
  if (m === 4) continue;
  const v = perMargin.get(m)!;
  const t = pairedT(base, v);
  const d = mean(v) - mean(base);
  console.log(
    `    margin ${String(m).padStart(2)}  ${d >= 0 ? "+" : ""}${(d * 100).toFixed(2)}pp  ` +
    `t=${t.toFixed(2)}  ${Math.abs(t) < 2.26 ? "within noise" : d > 0 ? "BETTER" : "WORSE"}`,
  );
}
const bestMargin = [...perMargin.entries()].reduce((a, b) => (mean(b[1]) > mean(a[1]) ? b : a));
console.log(
  `\n    vs best fixed, at margin ${bestMargin[0]}: ` +
  `${((mean(bestMargin[1]) - mean(best.val)) * 100).toFixed(2)}pp  ` +
  `t=${pairedT(best.val, bestMargin[1]).toFixed(2)}`,
);
process.exit(0);
