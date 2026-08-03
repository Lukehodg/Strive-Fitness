// Does strategy selection beat not selecting?
//
//   npx tsx server/trading/selectionEval.ts
//
// Written BEFORE the new selector, so the new selector gets judged rather than
// assumed. Earlier measurement in this project put auto-selection 5-6pp behind
// simply holding the best single strategy, which would mean the headline
// feature of the platform subtracts value. This harness is the instrument for
// settling that, and for telling whether any replacement is actually better.
//
// THE DESIGN THAT MAKES IT HONEST:
//
//   Walk forward. At each rebalance the policy sees ONLY history up to that
//   point, picks a strategy, and is then scored on the NEXT window, which it
//   has never seen. Repeat, compounding. This is the thing the live engine
//   does, so it is the thing to measure.
//
//   Every policy runs on identical price paths with identical rebalance points,
//   so differences are the policy and nothing else.
//
//   ORACLE is included as an upper bound and is NOT achievable live — it picks
//   the strategy that turns out best on each forward window, with hindsight. It
//   exists to show how much room there is between "always the same strategy"
//   and "perfect choice". If a real policy lands near BEST FIXED rather than
//   near ORACLE, selection is not buying anything.
//
//   BEST FIXED is also mildly optimistic: which single strategy is best is
//   itself chosen with hindsight over the whole run. A live policy beating
//   BEST FIXED is therefore a strong result; matching it is a fair one.

import { STRATEGY_LIST, type Strategy } from "./strategies";
import { backtestStrategy } from "./backtester";
import { selectStrategy } from "./aiSelector";
import { selectStrategyOOS } from "./selection";
import { generateSyntheticCandles } from "./marketData";
import type { Candle } from "@shared/schema";

/** Bars of history each selection decision may look at. */
const LOOKBACK = 600;
/** Bars each choice is then held for, and scored on. */
const HORIZON = 200;
/** Independent price paths. More paths, less chance one lucky series decides. */
const PATHS = 12;
/** Bars per path. */
const PATH_BARS = 6000;

interface Policy {
  name: string;
  /** Returns the strategy to hold for the next window. */
  pick(history: Candle[], current: string | undefined): Strategy;
}

/**
 * Realised return of holding `strategy` over `forward`, warmed up on the
 * preceding bars so indicators are settled at the first tradable bar.
 *
 * The backtester always skips its own WARMUP bars, so the slice handed to it
 * begins before the forward window and the return is read from the equity
 * curve at the boundary — otherwise the measurement would include P&L the
 * policy earned before it made this decision.
 */
const WARM = 240;

function forwardReturn(strategy: Strategy, candles: Candle[], start: number, end: number): number {
  const from = Math.max(0, start - WARM);
  const slice = candles.slice(from, end);
  const result = backtestStrategy(strategy, slice);
  const returns = result.returns ?? [];
  // returns[] is per-bar over the tradable portion of the slice, which begins
  // at slice index WARMUP (35). Map the forward window's first bar onto it.
  const tradableStart = 35;
  const offset = start - from - tradableStart;
  if (offset < 0 || offset >= returns.length) return 0;
  let mult = 1;
  for (let i = offset; i < returns.length; i++) mult *= 1 + returns[i];
  return mult - 1;
}

function runPolicy(policy: Policy, candles: Candle[]): { total: number; switches: number } {
  let equity = 1;
  let current: string | undefined;
  let switches = 0;

  for (let t = LOOKBACK; t + HORIZON <= candles.length; t += HORIZON) {
    const history = candles.slice(t - LOOKBACK, t);
    const chosen = policy.pick(history, current);
    if (current && chosen.meta.id !== current) switches++;
    current = chosen.meta.id;
    equity *= 1 + forwardReturn(chosen, candles, t, t + HORIZON);
  }
  return { total: equity - 1, switches };
}

/** Upper bound: the best choice for each window, known only afterwards. */
function runOracle(candles: Candle[]): number {
  let equity = 1;
  for (let t = LOOKBACK; t + HORIZON <= candles.length; t += HORIZON) {
    let best = -Infinity;
    for (const s of STRATEGY_LIST) {
      best = Math.max(best, forwardReturn(s, candles, t, t + HORIZON));
    }
    equity *= 1 + best;
  }
  return equity - 1;
}

const POLICIES: Policy[] = [
  {
    name: "CURRENT (in-sample)",
    pick: (h, cur) => selectStrategy(h, cur).chosen,
  },
  {
    name: "OOS (held-out folds)",
    pick: (h, cur) => selectStrategyOOS(h, cur).chosen,
  },
  ...STRATEGY_LIST.map((s) => ({
    name: `fixed: ${s.meta.name}`,
    pick: () => s,
  })),
];

function mean(xs: number[]): number {
  return xs.reduce((a, v) => a + v, 0) / xs.length;
}

/** Paired t across paths — same paths for both policies, so pairing is valid. */
function pairedT(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const d = Array.from({ length: n }, (_, i) => b[i] - a[i]);
  const m = mean(d);
  const v = d.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1);
  const se = Math.sqrt(v / n);
  return se > 0 ? m / se : 0;
}

const paths: Candle[][] = Array.from({ length: PATHS }, (_, i) =>
  generateSyntheticCandles(`EVAL${i}`, PATH_BARS, Date.UTC(2026, 0, 15) + i * 86_400_000),
);

console.log(
  `Walk-forward selection evaluation\n` +
  `  ${PATHS} paths x ${PATH_BARS} bars | lookback ${LOOKBACK} | horizon ${HORIZON}\n` +
  `  ${Math.floor((PATH_BARS - LOOKBACK) / HORIZON)} decisions per path, each scored on unseen data\n`,
);

const results = new Map<string, number[]>();
const switchCounts = new Map<string, number[]>();

for (const policy of POLICIES) {
  const totals: number[] = [];
  const sw: number[] = [];
  for (const path of paths) {
    const r = runPolicy(policy, path);
    totals.push(r.total);
    sw.push(r.switches);
  }
  results.set(policy.name, totals);
  switchCounts.set(policy.name, sw);
}

const oracle = paths.map(runOracle);

// Best fixed strategy, chosen with hindsight over the whole run.
const fixedNames = POLICIES.filter((p) => p.name.startsWith("fixed:")).map((p) => p.name);
const bestFixedName = fixedNames.reduce((best, n) =>
  mean(results.get(n)!) > mean(results.get(best)!) ? n : best,
);

const rows = [...results.entries()].sort((a, b) => mean(b[1]) - mean(a[1]));
console.log("  policy                          mean    median   worst    switches");
console.log("  " + "-".repeat(68));
for (const [name, totals] of rows) {
  const sorted = [...totals].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const sw = mean(switchCounts.get(name)!);
  console.log(
    `  ${name.padEnd(30)} ${(mean(totals) * 100).toFixed(2).padStart(7)}% ` +
    `${(med * 100).toFixed(2).padStart(7)}% ${(sorted[0] * 100).toFixed(2).padStart(7)}% ` +
    `${sw.toFixed(1).padStart(8)}`,
  );
}
console.log("  " + "-".repeat(68));
console.log(`  ${"ORACLE (hindsight, unreachable)".padEnd(30)} ${(mean(oracle) * 100).toFixed(2).padStart(7)}%`);

// --- the comparisons that decide something -----------------------------------
const current = results.get("CURRENT (in-sample)")!;
const oos = results.get("OOS (held-out folds)")!;
const bestFixed = results.get(bestFixedName)!;

console.log(`\n  best fixed strategy (hindsight): ${bestFixedName.replace("fixed: ", "")}`);

const cmp = (label: string, a: number[], b: number[]) => {
  const diff = mean(b) - mean(a);
  const t = pairedT(a, b);
  const verdict = Math.abs(t) < 2.2 ? "within noise" : diff > 0 ? "BETTER" : "WORSE";
  console.log(
    `  ${label.padEnd(42)} ${(diff * 100 >= 0 ? "+" : "")}${(diff * 100).toFixed(2)}pp  ` +
    `t=${t.toFixed(2)}  ${verdict}`,
  );
};

console.log("\n  paired across the same 12 paths (|t| > 2.2 clears noise at n=12):");
cmp("OOS vs CURRENT", current, oos);
cmp("CURRENT vs best fixed", bestFixed, current);
cmp("OOS vs best fixed", bestFixed, oos);

console.log(
  `\n  Selection is only worth having if a policy beats BEST FIXED — and that\n` +
  `  bar is already generous, since which strategy is "best" was decided with\n` +
  `  hindsight. Losing to it means the honest move is to stop selecting.`,
);
