// Stylized facts of asset returns — does a price series behave like a market?
//
// The synthetic feed underpins every performance number in this repository,
// and it was a Gaussian random walk with regime switches. Real return series
// are famously NOT that, and the differences are not academic — they are
// precisely the properties that decide whether a strategy survives:
//
//   FAT TAILS. Gaussian says a 5-sigma day happens once per 14,000 years.
//     Markets produce them every few years. A backtest on Gaussian data has
//     never seen the move that actually empties an account, so every stop-loss
//     and position size tuned on it is tuned for a world without disasters.
//
//   VOLATILITY CLUSTERING. Real volatility arrives in bursts — calm weeks then
//     violent ones. Gaussian noise has constant volatility, so a volatility
//     TARGETING system tested on it never has to do the one job it exists for.
//     It would look perfectly well-behaved and be completely untested.
//
//   LEVERAGE EFFECT. Falls raise future volatility more than rises do. Without
//     it, drawdowns in a backtest are far tamer than real ones, because in
//     reality losing and getting-more-dangerous happen together.
//
//   NO RETURN AUTOCORRELATION. Prices are close to a martingale at short lags.
//     A generator with autocorrelated returns hands trend-following a free
//     edge that does not exist, which is the single easiest way to fool
//     yourself into believing a moving-average crossover works.
//
// The reference ranges below are the consensus empirical findings, chiefly
// Cont (2001), "Empirical properties of asset returns: stylized facts and
// statistical issues". They are deliberately WIDE: the aim is to catch a
// generator that is qualitatively wrong, not to fit any particular market.

import type { Candle } from "@shared/schema";

export interface FactResult {
  name: string;
  value: number;
  expected: string;
  pass: boolean;
  why: string;
}

function mean(xs: number[]): number {
  return xs.reduce((a, v) => a + v, 0) / xs.length;
}

function stdev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1));
}

/** Excess kurtosis. 0 = Gaussian; markets run well above. */
export function excessKurtosis(xs: number[]): number {
  const m = mean(xs);
  const s = stdev(xs);
  if (!(s > 0)) return 0;
  return mean(xs.map((v) => ((v - m) / s) ** 4)) - 3;
}

/** Autocorrelation of a series at a given lag. */
export function autocorr(xs: number[], lag: number): number {
  if (xs.length <= lag + 2) return 0;
  const a = xs.slice(0, xs.length - lag);
  const b = xs.slice(lag);
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export function logReturns(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i - 1].close > 0 && candles[i].close > 0) {
      out.push(Math.log(candles[i].close / candles[i - 1].close));
    }
  }
  return out;
}

/** Aggregate returns into non-overlapping blocks of `k`. */
function aggregate(rets: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + k <= rets.length; i += k) {
    let s = 0;
    for (let j = 0; j < k; j++) s += rets[i + j];
    out.push(s);
  }
  return out;
}

/**
 * Score a return series against the stylized facts.
 *
 * Every threshold is a floor on "qualitatively market-like", not a target to
 * fit. A generator can pass all of these and still not be a market — but one
 * that FAILS them is definitely not, and any strategy result taken from it is
 * measuring the generator's quirks.
 */
export function checkStylizedFacts(candles: Candle[]): FactResult[] {
  const r = logReturns(candles);
  const out: FactResult[] = [];

  const kurt = excessKurtosis(r);
  out.push({
    name: "Fat tails (excess kurtosis)",
    value: kurt,
    // Bounded on BOTH sides. Too thin and the series has no disasters in it;
    // too fat and it is dominated by a handful of absurd bars, which makes
    // every strategy look terrible for an equally unrealistic reason.
    expected: "1 to 60  (Gaussian = 0; real intraday 2-50)",
    pass: kurt > 1 && kurt < 60,
    why: kurt <= 1
      ? "without fat tails a backtest never sees the move that empties an account"
      : "implausibly fat — results would be driven by a few absurd bars",
  });

  const ac1 = autocorr(r, 1);
  out.push({
    name: "Return autocorrelation (lag 1)",
    value: ac1,
    expected: "|rho| < 0.05  (near-martingale)",
    pass: Math.abs(ac1) < 0.05,
    why: "autocorrelated returns hand trend-following a free edge that is not real",
  });

  const absR = r.map(Math.abs);
  const volAc1 = autocorr(absR, 1);
  const volAc10 = autocorr(absR, 10);
  out.push({
    name: "Volatility clustering (ACF of |r|, lag 1)",
    value: volAc1,
    expected: "> 0.10  and slowly decaying",
    pass: volAc1 > 0.1,
    why: "constant volatility means vol targeting is never tested at all",
  });
  out.push({
    name: "Volatility persistence (ACF of |r|, lag 10)",
    value: volAc10,
    expected: "> 0.03  (decays slowly, not instantly)",
    pass: volAc10 > 0.03,
    why: "real volatility bursts last; a one-bar spike is not clustering",
  });

  // Leverage effect: today's return against tomorrow's absolute move.
  const lev = (() => {
    const a = r.slice(0, r.length - 1);
    const b = absR.slice(1);
    const ma = mean(a);
    const mb = mean(b);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < a.length; i++) {
      num += (a[i] - ma) * (b[i] - mb);
      da += (a[i] - ma) ** 2;
      db += (b[i] - mb) ** 2;
    }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
  })();
  out.push({
    name: "Leverage effect (corr r_t, |r_t+1|)",
    value: lev,
    expected: "< -0.01  (falls raise future volatility)",
    pass: lev < -0.01,
    why: "without it, losing and getting-more-dangerous never coincide, so drawdowns are too tame",
  });

  // Aggregational Gaussianity: tails thin out as returns are summed.
  //
  // Measured at 60 bars (1-minute -> hourly), not 10. The first version of
  // this check used 10 and failed on seeds with strong volatility clustering —
  // correctly, because a GARCH volatility burst comfortably spans ten bars, so
  // aggregating over it does not average anything out. That was the TEST being
  // mis-specified: the empirical fact is about meaningful aggregation
  // (minutes to days), not about ten adjacent bars. Fixing the generator to
  // satisfy the wrong test would have meant weakening the volatility
  // clustering that makes it realistic in the first place.
  const AGG = 60;
  const kurtAgg = excessKurtosis(aggregate(r, AGG));
  out.push({
    name: `Aggregational Gaussianity (kurtosis at ${AGG} bars)`,
    value: kurtAgg,
    expected: `< ${kurt.toFixed(2)}  (thinner than 1-bar tails)`,
    pass: kurtAgg < kurt,
    why: "real tails come from short-horizon shocks and wash out when aggregated",
  });

  return out;
}

/** Pretty-print a fact table. Returns the number of failures. */
export function reportFacts(label: string, candles: Candle[]): number {
  const facts = checkStylizedFacts(candles);
  console.log(`\n=== ${label} (${candles.length} bars) ===`);
  const w = Math.max(...facts.map((f) => f.name.length));
  for (const f of facts) {
    console.log(
      `  [${f.pass ? "ok  " : "FAIL"}] ${f.name.padEnd(w)}  ${f.value.toFixed(4).padStart(9)}   ${f.expected}`,
    );
    if (!f.pass) console.log(`         ${" ".repeat(w)}  -> ${f.why}`);
  }
  return facts.filter((f) => !f.pass).length;
}
