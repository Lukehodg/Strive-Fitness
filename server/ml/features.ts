// Feature engineering for the ML signal model.
//
// At each bar we turn recent price action into a fixed vector of numeric
// features the classifier can learn from. These are all standard, interpretable
// technical signals drawn from the TA/quant literature — the model learns how
// to *weight* them, which is what makes its output inspectable (the learned
// weight on each named feature is its importance).

import type { Candle } from "@shared/schema";
import {
  sma,
  ema,
  rsi,
  stddev,
  atr,
  highest,
  lowest,
  INDICATOR_LOOKBACK_WINDOW,
} from "../trading/indicators";
import {
  tripleBarrierLabel,
  DEFAULT_TRIPLE_BARRIER,
  type TripleBarrierOptions,
} from "./labeling";

/** Human-readable names, in the same order features are emitted. */
export const FEATURE_NAMES = [
  "return_1", // last bar's return
  "return_5", // 5-bar return
  "rsi_14", // RSI, scaled to 0..1
  "sma_ratio", // fast/slow MA spread
  "ema_spread", // MACD-style fast/slow EMA spread, normalized
  "momentum_20", // price vs its 20-bar average
  "bollinger_b", // %b: position within Bollinger bands
  "atr_pct", // Average True Range as a fraction of price
  "volume_ratio", // volume vs its 20-bar average
  "range_pos_20", // where price sits in its 20-bar range
] as const;

/** Bars of history required before features are defined. */
export const MIN_LOOKBACK = 30;
/** Forward horizon (bars) used by the labeler; also the CV purge size. */
export const LABEL_HORIZON = DEFAULT_TRIPLE_BARRIER.horizon;

/**
 * Extract the feature vector for bar index `i`, using only data up to and
 * including `i` (no lookahead). Returns null if there isn't enough history.
 */
export function extractFeatures(candles: Candle[], i: number): number[] | null {
  if (i < MIN_LOOKBACK) return null;
  // Bounded trailing window, not full history — see INDICATOR_LOOKBACK_WINDOW.
  // Without this, building a dataset from N candles costs O(N²): confirmed
  // ~15s for a realistic 2-year hourly download before this fix.
  const w = candles.slice(Math.max(0, i + 1 - INDICATOR_LOOKBACK_WINDOW), i + 1);
  const c = w.map((x) => x.close);
  const price = c[c.length - 1];

  const ret1 = price / c[c.length - 2] - 1;
  const ret5 = price / c[c.length - 6] - 1;

  const r = rsi(c, 14);
  const rsiScaled = r === null ? 0.5 : r / 100;

  const fast = sma(c, 10);
  const slow = sma(c, 30);
  const smaRatio = fast !== null && slow !== null ? fast / slow - 1 : 0;

  const ema12 = ema(c, 12);
  const ema26 = ema(c, 26);
  const emaSpread = ema12 !== null && ema26 !== null ? (ema12 - ema26) / price : 0;

  const avg20 = sma(c, 20);
  const momentum = avg20 !== null ? price / avg20 - 1 : 0;

  // Bollinger %b over 20 bars, 2 std.
  const mid = sma(c, 20);
  const sd = stddev(c, 20);
  let bollB = 0.5;
  if (mid !== null && sd !== null && sd > 0) {
    const lower = mid - 2 * sd;
    const upper = mid + 2 * sd;
    bollB = (price - lower) / (upper - lower);
  }

  const atrVal = atr(
    w.map((x) => x.high),
    w.map((x) => x.low),
    c,
    14,
  );
  const atrPct = atrVal !== null ? atrVal / price : 0;

  const volumes = w.map((x) => x.volume);
  const vAvg = sma(volumes, 20);
  const volRatio = vAvg && vAvg > 0 ? volumes[volumes.length - 1] / vAvg - 1 : 0;

  const hi = highest(c, 20);
  const lo = lowest(c, 20);
  const rangePos = hi !== null && lo !== null && hi > lo ? (price - lo) / (hi - lo) : 0.5;

  return [
    ret1,
    ret5,
    rsiScaled,
    smaRatio,
    emaSpread,
    momentum,
    bollB,
    atrPct,
    volRatio,
    rangePos,
  ];
}

export interface Dataset {
  X: number[][];
  y: number[];
}

/**
 * Build a supervised dataset from candles: features at bar i, labelled by the
 * triple-barrier method (1 = a take-profit move happened before a stop within
 * the horizon; 0 otherwise).
 */
export function buildDataset(
  candles: Candle[],
  labelOpts: TripleBarrierOptions = DEFAULT_TRIPLE_BARRIER,
  /**
   * Optional extra features per bar, indexed the same way as `candles` — used
   * to append news features. Omitted, the dataset is exactly what it was
   * before, so the existing model is unaffected until an ablation says the
   * extras earn their place.
   */
  extra?: number[][],
): Dataset {
  const X: number[][] = [];
  const y: number[] = [];
  const end = candles.length - labelOpts.horizon - 1;
  for (let i = MIN_LOOKBACK; i <= end; i++) {
    const feats = extractFeatures(candles, i);
    if (!feats) continue;
    const label = tripleBarrierLabel(candles, i, labelOpts);
    if (label === null) continue;
    X.push(extra ? [...feats, ...extra[i]] : feats);
    y.push(label);
  }
  return { X, y };
}
