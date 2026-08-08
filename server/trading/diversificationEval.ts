// How many symbols is worth holding?
//
//   npx tsx server/trading/diversificationEval.ts
//
// "More symbols means sqrt(N) better risk-adjusted returns" is true only for
// INDEPENDENT bets. Crypto is the opposite of independent — BTC, ETH and SOL
// share most of their variance — so the effective N is far below the nominal
// one and the benefit saturates early. Raising maxConcurrentPositions on the
// strength of the sqrt(N) slogan would buy correlated risk while believing it
// bought diversification.
//
// So this measures it. Paths are built with a controlled correlation to a
// common factor, a strategy is run on each, and equal-weight books of
// increasing size are scored. The question answered is: at what N does adding
// another position stop improving Sharpe?

import { STRATEGIES } from "./strategies";
import { backtestStrategy, type BacktestSizing } from "./backtester";
import { setCostOverrides } from "./costs";
import { portfolioVolatility, type RiskLeg } from "./portfolioVol";
import type { Candle } from "@shared/schema";

setCostOverrides({}); // corrected cost defaults

const BARS = 4000;
const MAX_SYMBOLS = 8;
const TRIALS = 6;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal from a uniform generator. */
function normal(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * `count` price series sharing a common factor, so their pairwise correlation
 * is approximately `rho`:  r_i = sqrt(rho)*f + sqrt(1-rho)*e_i
 *
 * The innovations are GARCH-modulated Student-t, matching the main feed's
 * process (marketData.ts) rather than the plain Gaussian this used at first.
 *
 * That original version was a second instance of the same mistake the main
 * generator had: constant volatility and thin tails. It went unnoticed longer
 * because this file has its OWN generator, so fixing the shared one left this
 * untouched — the numbers came back byte-identical after the rebuild, which is
 * what gave it away. A local copy of a defect outlives the fix to the original.
 *
 * The common factor carries its own volatility clustering, so correlated names
 * get violent together, which is exactly when diversification fails and
 * therefore exactly what this file exists to measure.
 */
function correlatedPaths(count: number, rho: number, seed: number): Candle[][] {
  const rand = mulberry32(seed);
  const baseVol = 0.004;
  const a = Math.sqrt(rho);
  const b = Math.sqrt(1 - rho);

  // Shared GARCH(1,1) volatility path for the common factor.
  const ALPHA = 0.06;
  const BETA = 0.9;
  const OMEGA = baseVol * baseVol * (1 - ALPHA - BETA);
  const factor: number[] = [];
  const factorVol: number[] = [];
  let variance = baseVol * baseVol;
  let last = 0;
  for (let t = 0; t < BARS; t++) {
    variance = Math.min(OMEGA + ALPHA * last * last + BETA * variance, (baseVol * 8) ** 2);
    const vol = Math.sqrt(variance);
    const shock = vol * studentT(rand);
    factor.push(shock / baseVol); // standardized, so `a`/`b` weights still hold
    factorVol.push(vol);
    last = shock;
  }

  return Array.from({ length: count }, () => {
    let price = 30_000;
    const candles: Candle[] = [];
    for (let t = 0; t < BARS; t++) {
      // Idiosyncratic part shares the factor's volatility level, so a stressed
      // market is stressed for every name at once.
      const idio = studentT(rand);
      const r = (a * factor[t] + b * idio) * factorVol[t];
      const open = price;
      price = Math.max(1, price * (1 + r));
      const wick = Math.abs(normal(rand)) * factorVol[t] * 0.5;
      const high = Math.max(open, price) * (1 + wick);
      const low = Math.min(open, price) * (1 - wick);
      candles.push({ time: t * 60_000, open, high, low, close: price, volume: 1000 });
    }
    return candles;
  });
}

/** Student-t(6) standardized to unit variance — fat tails, unchanged scale. */
function studentT(rand: () => number): number {
  const norm = () => normal(rand);
  const df = 6;
  let chi = 0;
  for (let i = 0; i < df; i++) {
    const z = norm();
    chi += z * z;
  }
  return norm() / Math.sqrt(chi / df) / Math.sqrt(df / (df - 2));
}

const sizing: BacktestSizing = {
  maxPositionPct: 0.25,
  adaptive: false,
  volTargetPct: 0.004,
  kellyFraction: 0.5,
  limitOrderOffsetPct: 0.0006,
  symbol: "EUR/USD",
  makerOnlyEntries: false,
};

const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;
function sd(xs: number[]) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

/** Sharpe of an equal-weight book of the first n return series. */
function bookSharpe(series: number[][], n: number): number {
  const len = Math.min(...series.slice(0, n).map((s) => s.length));
  const combined: number[] = [];
  for (let t = 0; t < len; t++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += series[i][t];
    combined.push(sum / n);
  }
  const s = sd(combined);
  return s > 0 ? mean(combined) / s : 0;
}

console.log("Diversification — where does adding another symbol stop helping?\n");
console.log("Equal-weight book of N symbols, Sharpe per bar (mean of 6 trials)\n");

const RHOS = [0.0, 0.5, 0.85];
console.log("  N      rho=0.00    rho=0.50    rho=0.85   <- typical crypto");
console.log("  " + "-".repeat(56));

const table: Record<number, number[]> = {};
for (const rho of RHOS) {
  const perN: number[][] = Array.from({ length: MAX_SYMBOLS + 1 }, () => []);
  for (let trial = 0; trial < TRIALS; trial++) {
    const paths = correlatedPaths(MAX_SYMBOLS, rho, 1000 + trial * 17);
    const series = paths.map(
      (p) => backtestStrategy(STRATEGIES.breakout, p, 10_000, 0.03, 0.06, sizing).returns ?? [],
    );
    for (let n = 1; n <= MAX_SYMBOLS; n++) perN[n].push(bookSharpe(series, n));
  }
  for (let n = 1; n <= MAX_SYMBOLS; n++) {
    table[n] = table[n] ?? [];
    table[n].push(mean(perN[n]));
  }
}

for (let n = 1; n <= MAX_SYMBOLS; n++) {
  console.log(
    `  ${String(n).padStart(2)}  ` +
    table[n].map((v) => v.toFixed(4).padStart(11)).join(" "),
  );
}

// --- where it saturates -------------------------------------------------------
console.log("\n  improvement from adding the Nth symbol (rho=0.85, the realistic case):");
const realistic = table;
for (let n = 2; n <= MAX_SYMBOLS; n++) {
  const gain = realistic[n][2] - realistic[n - 1][2];
  const pctOfFirst = realistic[1][2] !== 0 ? (gain / Math.abs(realistic[1][2])) * 100 : 0;
  console.log(
    `    ${n - 1} -> ${n}:  ${gain >= 0 ? "+" : ""}${gain.toFixed(4)}  (${pctOfFirst >= 0 ? "+" : ""}${pctOfFirst.toFixed(1)}% of a single position's Sharpe)`,
  );
}

// --- what the correlation does to the risk budget -----------------------------
console.log("\n  Effective diversification (book vol vs the sqrt(N) ideal):");
console.log("    N    rho=0.00   rho=0.85   effective N at rho=0.85");
for (const n of [1, 2, 3, 4, 6, 8]) {
  const legs = (rho: number): RiskLeg[] =>
    Array.from({ length: n }, (_, i) => ({ symbol: `S${i}`, weight: 1 / n, vol: 0.02 }));
  const indep = portfolioVolatility(legs(0), () => 0);
  const corr = portfolioVolatility(legs(0.85), () => 0.85);
  // Effective N: how many INDEPENDENT positions would give this much risk
  // reduction. This is the number that matters for a position limit.
  const effN = (0.02 / corr) ** 2;
  console.log(
    `    ${String(n).padStart(2)}   ${(indep * 100).toFixed(3)}%    ${(corr * 100).toFixed(3)}%` +
    `        ${effN.toFixed(2)}`,
  );
}

console.log(
  "\n  Effective N is what a concurrency limit should be set against. At 0.85\n" +
  "  correlation, eight crypto positions carry the risk-reduction of barely\n" +
  "  more than one — so raising the limit buys turnover and fees, not\n" +
  "  diversification. Mixing asset classes is what actually lowers rho.",
);
