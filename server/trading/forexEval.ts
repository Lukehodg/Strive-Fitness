// Does the 65x cheaper market actually change the outcome?
//
//   npx tsx server/trading/forexEval.ts
//
// THE PREMISE BEING TESTED. Execution cost is the largest identified drag in
// this system, and FX costs about a sixty-fifth of crypto. The obvious
// inference is that moving to FX should turn the losses on the corrected
// generator into something better. That inference is worth checking rather
// than assuming, because there is an equally obvious counter-argument:
// cheaper execution multiplies an edge, and multiplying a negative number by
// anything leaves it negative.
//
// So this runs the SAME strategies over the SAME number of paths on each asset
// class, with each class's own costs and its own volatility-scaled stop and
// target, and reports what actually happens.
//
// READ THE OUTPUT AS A PROPERTY OF THE GENERATOR, not of any market. These are
// synthetic paths. What the comparison can legitimately establish is the
// RELATIVE effect of the cost difference, because that is the only thing that
// differs between the columns.
//
// ---------------------------------------------------------------------------
// WHY THE HEADLINE COLUMN IS THE TAKER ONE
// ---------------------------------------------------------------------------
//
// The first version of this file reported maker fills and printed +0.69% for
// equities and +0.57% for FX — apparently turning a losing system profitable
// simply by moving to a cheaper market. That result was an artifact, and the
// decomposition is worth keeping because it is easy to fall for.
//
// Stripping costs entirely from the crypto paths gives -0.05% +/- 0.07: zero,
// which is the correct answer for a driftless series and good evidence the
// backtester is not manufacturing an edge. Every difference between the
// configurations is then accounted for by cost alone:
//
//     crypto, Breakout Momentum       taker      maker
//       real fees                     -8.68%     -2.54%
//       fees forced to zero           -1.21%     -0.05%
//
// So where does a POSITIVE number come from on equities and FX? Their fees are
// zero, so a maker fill pays nothing at all while still executing at the
// posted limit — mid minus the offset on the way in, mid plus it on the way
// out. The backtester therefore credits roughly 2 x offset of pure spread
// capture on every round trip, and at ~115 trades that is more than a percent
// of equity conjured out of the fill model.
//
// That is not an edge, it is the absence of ADVERSE SELECTION. A resting order
// here fills whenever the bar's range touches it. In a real book you are
// filled by someone who wanted to trade at that price, which correlates with
// the price continuing against you. Nothing in this simulation models that, so
// the maker column is an upper bound that live fills will not honour.
//
// The taker column makes no such assumption, so it is the one to trust.

import { STRATEGY_LIST } from "./strategies";
import { backtestStrategy, type BacktestSizing } from "./backtester";
import { generateSyntheticCandles } from "./marketData";
import { roundTripCost, setCostOverrides } from "./costs";
import { volScaleFor } from "./assets";
import type { Candle } from "@shared/schema";

const PATHS = 40;
const BARS = 6000;
/** Crypto-calibrated day-profile settings, scaled per class exactly as the engine does. */
const BASE_STOP = 0.02;
const BASE_TARGET = 0.04;
const BASE_OFFSET = 0.0006;

setCostOverrides({});

const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

/**
 * Paths for a class, seeded so each class gets its OWN set of random draws.
 *
 * Deliberately not the same underlying shocks rescaled: that would make the
 * comparison a paired test on one realisation, and a single lucky or unlucky
 * path would then move every column together and look like a real difference.
 */
function pathsFor(symbol: string, tag: string): Candle[][] {
  return Array.from({ length: PATHS }, (_, i) =>
    generateSyntheticCandles(`${tag}${i}`, BARS, Date.UTC(2026, 0, 15) + i * 86_400_000),
  ).map((p) => p) as Candle[][];
}

function sizingFor(symbol: string): BacktestSizing {
  return {
    maxPositionPct: 0.25,
    adaptive: false,
    volTargetPct: 0.0015 * volScaleFor(symbol),
    kellyFraction: 0.5,
    limitOrderOffsetPct: BASE_OFFSET * volScaleFor(symbol),
    symbol,
    makerOnlyEntries: false,
  };
}

const CLASSES: Array<{ label: string; symbol: string; tag: string }> = [
  { label: "crypto", symbol: "BTC/USD", tag: "FXEVAL-C" },
  { label: "equity", symbol: "AAPL", tag: "FXEVAL-E" },
  { label: "forex", symbol: "EUR/USD", tag: "FXEVAL-F" },
];

console.log(`Same strategies, same path count, each class with its own costs and scaled risk`);
console.log(`${PATHS} paths x ${BARS} bars, day-profile settings scaled per class\n`);

console.log("  class    stop/target      round trip   cost as % of target");
console.log("  " + "-".repeat(62));
for (const c of CLASSES) {
  const scale = volScaleFor(c.symbol);
  const cost = roundTripCost(c.symbol, false);
  console.log(
    `  ${c.label.padEnd(8)} ${(BASE_STOP * scale * 100).toFixed(3)}%/${(BASE_TARGET * scale * 100).toFixed(3)}%`.padEnd(35) +
      `${(cost * 100).toFixed(4)}%`.padEnd(13) +
      `${((cost / (BASE_TARGET * scale)) * 100).toFixed(1)}%`,
  );
}

const byClass = new Map(CLASSES.map((c) => [c.label, pathsFor(c.symbol, c.tag)]));

function table(title: string, makerOffset: boolean, caveat: string) {
  console.log(`\n\n${title}`);
  console.log(`  strategy                    ` + CLASSES.map((c) => c.label.padStart(18)).join(""));
  console.log("  " + "-".repeat(28 + 18 * CLASSES.length));
  const best = new Map<string, number>();
  for (const strat of STRATEGY_LIST) {
    const cells: string[] = [];
    for (const c of CLASSES) {
      const scale = volScaleFor(c.symbol);
      const sizing = { ...sizingFor(c.symbol), limitOrderOffsetPct: makerOffset ? BASE_OFFSET * scale : 0 };
      const rets = byClass
        .get(c.label)!
        .map((p) => backtestStrategy(strat, p, 10_000, BASE_STOP * scale, BASE_TARGET * scale, sizing).returnPct);
      const m = mean(rets);
      // Standard error across paths, so a difference reads as signal or noise.
      const se = sd(rets) / Math.sqrt(rets.length);
      cells.push(`${(m * 100).toFixed(2)}% ±${(se * 100).toFixed(2)}`.padStart(18));
      best.set(c.label, Math.max(best.get(c.label) ?? -Infinity, m));
    }
    console.log(`  ${strat.meta.name.padEnd(26)}` + cells.join(""));
  }
  console.log("  " + "-".repeat(28 + 18 * CLASSES.length));
  console.log(
    `  ${"best available".padEnd(26)}` +
      CLASSES.map((c) => `${((best.get(c.label) ?? 0) * 100).toFixed(2)}%`.padStart(18)).join(""),
  );
  console.log(`  ${caveat}`);
}

table(
  "TAKER FILLS — crossing the spread every time. The number to trust.",
  false,
  "No fill-model assumptions: every entry and exit pays the full cost.",
);

table(
  "MAKER FILLS — resting limit orders. AN UPPER BOUND, NOT A FORECAST.",
  true,
  "Credits ~2x the offset of spread capture per round trip and models NO adverse\n" +
    "  selection, so it flatters zero-fee classes (equities, FX) the most.",
);

// ---------------------------------------------------------------------------
// The control that decides how to read all of the above
// ---------------------------------------------------------------------------
//
// The taker table shows FX slightly POSITIVE, which on a driftless series would
// be an artifact worth hunting down. So: shuffle the bars in time. That keeps
// every bar's shape and the whole marginal return distribution, and destroys
// volatility clustering and the regime blocks.
//
// If the returns survive the shuffle, the backtester is manufacturing them and
// nothing here can be believed. If they collapse to zero, the strategies were
// reading real time-structure — and since this generator HAS a deliberate
// regime drift, that is the expected and legitimate answer.
function shuffleBars(src: Candle[], seed: number): Candle[] {
  let a = seed;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shape = src.map((c) => ({
    ret: c.close / c.open - 1,
    hi: c.high / Math.max(c.open, c.close),
    lo: c.low / Math.min(c.open, c.close),
    v: c.volume,
  }));
  for (let i = shape.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shape[i], shape[j]] = [shape[j], shape[i]];
  }
  const out: Candle[] = [];
  let price = src[0].open;
  for (let i = 0; i < shape.length; i++) {
    const s = shape[i];
    const open = price;
    const close = open * (1 + s.ret);
    out.push({
      time: src[i].time,
      open,
      high: Math.max(open, close) * s.hi,
      low: Math.min(open, close) * s.lo,
      close,
      volume: s.v,
    });
    price = close;
  }
  return out;
}

console.log("\n\nCONTROL — the same FX paths with their time-structure shuffled away");
console.log("  strategy                          original         shuffled");
console.log("  " + "-".repeat(58));
{
  const scale = volScaleFor("EUR/USD");
  const original = byClass.get("forex")!;
  const shuffled = original.map((p, i) => shuffleBars(p, 1000 + i));
  const sizing = { ...sizingFor("EUR/USD"), limitOrderOffsetPct: 0 };
  for (const strat of STRATEGY_LIST) {
    if (strat.meta.id === "ml_signal") continue;
    const cells = [original, shuffled].map((set) => {
      const rets = set.map(
        (p) => backtestStrategy(strat, p, 10_000, BASE_STOP * scale, BASE_TARGET * scale, sizing).returnPct,
      );
      const t = mean(rets) / (sd(rets) / Math.sqrt(rets.length));
      return `${(mean(rets) * 100).toFixed(2)}% (t=${t.toFixed(1)})`.padStart(18);
    });
    console.log(`  ${strat.meta.name.padEnd(26)}` + cells.join(""));
  }
}
console.log(
  "  Shuffled returns collapse to zero, so the backtester is not inventing them.\n" +
    "  What the strategies are reading is this generator's REGIME DRIFT — a trend\n" +
    "  deliberately built into marketData.ts so strategies have something to find.\n" +
    "  It is not evidence that a real market contains the same thing.",
);

console.log(`
Reading this honestly:

  - The columns differ ONLY in cost and in the volatility the risk settings
    are scaled to. Same strategies, same generator, same path count.
  - "±" is the standard error across paths. A gap smaller than a couple of
    those is not a result.
  - The only thing being traded here is this generator's own regime drift, and
    the control above shows exactly that: shuffle the bars and every strategy
    goes to zero. That drift is a construction choice in marketData.ts, put
    there so strategies have something to find. A real FX major has far less.
  - So the result is NOT "FX is profitable". It is "an edge of this size
    survives FX costs and does not survive crypto costs". Same edge, same
    strategies; only the execution bill differs, and it is the whole gap
    between the crypto column and the other two.
  - Which is the actual claim worth making: cheaper execution MULTIPLIES an
    edge. It never creates one. Whether a real edge exists is a question only
    real data can answer — see \`npm run train\`.
`);
