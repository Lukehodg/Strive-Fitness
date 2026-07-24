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

/** Rolling stdev of simple returns ending at bar i (exclusive of future). */
function volatilityAt(closes: number[], i: number, lookback: number): number {
  const start = Math.max(1, i - lookback + 1);
  const rets: number[] = [];
  for (let k = start; k <= i; k++) rets.push(closes[k] / closes[k - 1] - 1);
  if (rets.length === 0) return 0.01;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varr) || 0.005;
}

/**
 * Compute the triple-barrier label for a single bar `i`. Returns 1, 0, or null
 * if there isn't enough forward data to resolve the horizon.
 */
export function tripleBarrierLabel(
  candles: Candle[],
  i: number,
  opts: TripleBarrierOptions,
): number | null {
  const closes = candles.map((c) => c.close);
  if (i + 1 >= candles.length) return null;
  const vol = volatilityAt(closes, i, opts.volLookback);
  const entry = closes[i];
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
  return closes[end] > entry * (1 + 0.2 * opts.upMult * vol) ? 1 : 0;
}
