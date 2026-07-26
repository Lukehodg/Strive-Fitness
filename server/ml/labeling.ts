// Triple-barrier labeling (after López de Prado, "Advances in Financial
// Machine Learning").
//
// Naive labeling ("is the price higher N bars later?") is noisy: it ignores the
// path the price took and treats a +0.01% drift the same as a clean run-up. The
// triple-barrier method instead asks a trading-relevant question: starting now,
// does price hit a profit target (upper barrier) before a stop (lower barrier)
// within a horizon? Barriers are scaled by recent volatility, so the labels
// adapt to calm vs turbulent markets.
//
// For our binary "should I buy?" model:
//   label 1 = the upper (take-profit) barrier was hit first
//   label 0 = the lower (stop) barrier was hit first, or neither within horizon

import type { Candle } from "@shared/schema";

export interface TripleBarrierOptions {
  /** Max bars to look forward before the vertical (time) barrier. */
  horizon: number;
  /** Upper barrier = price * (1 + upMult * volatility). */
  upMult: number;
  /** Lower barrier = price * (1 - downMult * volatility). */
  downMult: number;
  /** Lookback for the volatility estimate that scales the barriers. */
  volLookback: number;
}

export const DEFAULT_TRIPLE_BARRIER: TripleBarrierOptions = {
  horizon: 24,
  upMult: 1.0,
  downMult: 1.0,
  volLookback: 24,
};

/**
 * Rolling stdev of simple returns ending at bar i (exclusive of future).
 * Reads closes directly off `candles` — no full-array `.map()` — so this
 * stays O(lookback) regardless of how large the candle history is.
 */
function volatilityAt(candles: Candle[], i: number, lookback: number): number {
  const start = Math.max(1, i - lookback + 1);
  let n = 0;
  let sum = 0;
  const rets: number[] = [];
  for (let k = start; k <= i; k++) {
    const r = candles[k].close / candles[k - 1].close - 1;
    rets.push(r);
    sum += r;
    n++;
  }
  if (n === 0) return 0.01;
  const mean = sum / n;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(varr) || 0.005;
}

/**
 * Compute the triple-barrier label for a single bar `i`. Returns 1, 0, or null
 * if there isn't enough forward data to resolve the horizon.
 *
 * Reads `candles[i].close` etc. directly rather than mapping the whole array
 * to closes on every call — `buildDataset` calls this once per bar, so a
 * full-array `.map()` per call turned dataset construction from O(bars) into
 * O(bars²) on any realistic download (confirmed the dominant remaining cost
 * on a 17,520-bar dataset).
 */
export function tripleBarrierLabel(
  candles: Candle[],
  i: number,
  opts: TripleBarrierOptions,
): number | null {
  if (i + 1 >= candles.length) return null;
  const vol = volatilityAt(candles, i, opts.volLookback);
  const entry = candles[i].close;
  const upper = entry * (1 + opts.upMult * vol);
  const lower = entry * (1 - opts.downMult * vol);
  const end = Math.min(candles.length - 1, i + opts.horizon);
  if (end <= i) return null;

  for (let k = i + 1; k <= end; k++) {
    // Use the bar's high/low so intrabar barrier touches are captured.
    if (candles[k].high >= upper) return 1; // profit target hit first
    if (candles[k].low <= lower) return 0; // stop hit first
  }
  // Vertical barrier: neither hit — label by net drift, but treat flat as 0
  // (no trade-worthy up move materialized).
  return candles[end].close > entry * (1 + 0.2 * opts.upMult * vol) ? 1 : 0;
}
