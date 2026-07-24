// Feature engineering for the ML signal model.
//
// At each bar we turn recent price action into a fixed vector of numeric
// features the classifier can learn from. The features are all standard,
// interpretable technical signals — the model learns how to *weight* them,
// which is exactly what makes its output inspectable (the learned weight on
// each named feature is its importance).

import type { Candle } from "@shared/schema";
import { sma, rsi, stddev, highest, lowest } from "../trading/indicators";

/** Human-readable names, in the same order features are emitted. */
export const FEATURE_NAMES = [
  "return_1", // last bar's return
  "return_5", // 5-bar return
  "rsi_14", // RSI, scaled to 0..1
  "sma_ratio", // fast/slow MA spread
  "momentum_10", // price vs its 10-bar average
  "volatility_10", // recent return volatility
  "range_pos_20", // where price sits in its 20-bar range
] as const;

/** Bars of history required before features are defined. */
export const MIN_LOOKBACK = 30;
/** Forward horizon (bars) used to label "did price go up?". */
export const LABEL_HORIZON = 5;

/**
 * Extract the feature vector for bar index `i`, using only data up to and
 * including `i` (no lookahead). Returns null if there isn't enough history.
 */
export function extractFeatures(candles: Candle[], i: number): number[] | null {
  if (i < MIN_LOOKBACK) return null;
  const window = candles.slice(0, i + 1);
  const c = window.map((x) => x.close);
  const price = c[c.length - 1];

  const ret1 = price / c[c.length - 2] - 1;
  const ret5 = price / c[c.length - 6] - 1;

  const r = rsi(c, 14);
  const rsiScaled = r === null ? 0.5 : r / 100;

  const fast = sma(c, 10);
  const slow = sma(c, 30);
  const smaRatio = fast !== null && slow !== null ? fast / slow - 1 : 0;

  const avg10 = sma(c, 10);
  const momentum = avg10 !== null ? price / avg10 - 1 : 0;

  // Volatility: stddev of the last 10 simple returns.
  const rets: number[] = [];
  for (let k = c.length - 10; k < c.length; k++) rets.push(c[k] / c[k - 1] - 1);
  const vol = stddev(rets, rets.length) ?? 0;

  const hi = highest(c, 20);
  const lo = lowest(c, 20);
  const rangePos = hi !== null && lo !== null && hi > lo ? (price - lo) / (hi - lo) : 0.5;

  return [ret1, ret5, rsiScaled, smaRatio, momentum, vol, rangePos];
}

export interface Dataset {
  X: number[][];
  y: number[];
}

/**
 * Build a supervised dataset from candles: features at bar i, labelled 1 if the
 * forward return over LABEL_HORIZON bars is positive, else 0.
 */
export function buildDataset(candles: Candle[]): Dataset {
  const X: number[][] = [];
  const y: number[] = [];
  const end = candles.length - LABEL_HORIZON - 1;
  for (let i = MIN_LOOKBACK; i <= end; i++) {
    const feats = extractFeatures(candles, i);
    if (!feats) continue;
    const future = candles[i + LABEL_HORIZON].close;
    const now = candles[i].close;
    X.push(feats);
    y.push(future > now ? 1 : 0);
  }
  return { X, y };
}
