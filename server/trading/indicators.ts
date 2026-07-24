// Pure technical-analysis helpers. Every function is side-effect free and
// operates on plain number arrays so they're trivial to unit test.

/** Simple moving average of the last `period` values. Returns null if short. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Exponential moving average over the whole series (final value). */
export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  // Seed with the SMA of the first `period` values.
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i];
  prev /= period;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
  }
  return prev;
}

/**
 * Wilder's RSI over the last `period` deltas. Returns a value in [0, 100],
 * or null when there isn't enough data.
 */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  // Initial average gain/loss over the first `period` changes.
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  // Smooth across the remaining values.
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Population standard deviation of the last `period` values. */
export function stddev(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance =
    slice.reduce((a, b) => a + (b - mean) * (b - mean), 0) / period;
  return Math.sqrt(variance);
}

/** Highest value over the last `period` entries. */
export function highest(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return Math.max(...values.slice(values.length - period));
}

/** Lowest value over the last `period` entries. */
export function lowest(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return Math.min(...values.slice(values.length - period));
}

/**
 * Average True Range from OHLC data — a volatility measure used for
 * regime detection and (optionally) stop sizing.
 */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number | null {
  const n = closes.length;
  if (n < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trs.push(tr);
  }
  // Simple average of the last `period` true ranges.
  const slice = trs.slice(trs.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}
