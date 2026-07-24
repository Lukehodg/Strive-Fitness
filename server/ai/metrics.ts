// Backtest statistics (after Bailey & López de Prado).
//
// A raw Sharpe ratio from one backtest is easy to fake: try enough parameter
// sets and the best one looks great by luck alone. These metrics correct for
// that:
//   - Probabilistic Sharpe Ratio (PSR): the probability that the TRUE Sharpe
//     exceeds a benchmark, accounting for sample length and the non-normality
//     (skew/kurtosis) of returns.
//   - Deflated Sharpe Ratio (DSR): PSR measured against the Sharpe you'd
//     expect the *best of N trials* to reach by pure chance — the multiple-
//     testing correction. DSR ≈ 0.5 means "no better than the luckiest coin".
//   - Minimum Track Record Length (MinTRL): how many observations you'd need
//     before a given Sharpe is statistically distinguishable from zero.
//
// All pure functions on plain arrays; no dependencies.

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n−1). */
export function std(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
}

/** Sample skewness. */
export function skewness(xs: number[]): number {
  const n = xs.length;
  const s = std(xs);
  if (n < 3 || s === 0) return 0;
  const m = mean(xs);
  return xs.reduce((a, b) => a + ((b - m) / s) ** 3, 0) / n;
}

/** Sample kurtosis (non-excess; normal ≈ 3). */
export function kurtosis(xs: number[]): number {
  const n = xs.length;
  const s = std(xs);
  if (n < 4 || s === 0) return 3;
  const m = mean(xs);
  return xs.reduce((a, b) => a + ((b - m) / s) ** 4, 0) / n;
}

/** Per-period Sharpe ratio (mean/std of the given returns; not annualized). */
export function sharpe(returns: number[]): number {
  const s = std(returns);
  if (s === 0) return 0;
  return mean(returns) / s;
}

// -- Normal distribution helpers -------------------------------------------

/** Standard normal CDF (Abramowitz–Stegun erf approximation). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  let p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (x > 0) p = 1 - p;
  return p;
}

/** Inverse standard normal CDF (Acklam's algorithm). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pLow) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// -- The headline metrics ---------------------------------------------------

/**
 * Probabilistic Sharpe Ratio: P(true Sharpe > srBenchmark) given an observed
 * per-period Sharpe over T observations with the given skew/kurtosis.
 */
export function probabilisticSharpe(
  sr: number,
  T: number,
  skew: number,
  kurt: number,
  srBenchmark = 0,
): number {
  if (T < 2) return 0.5;
  const denom = Math.sqrt(Math.max(1e-9, 1 - skew * sr + ((kurt - 1) / 4) * sr * sr));
  return normCdf(((sr - srBenchmark) * Math.sqrt(T - 1)) / denom);
}

const EULER_MASCHERONI = 0.5772156649015329;

/**
 * The Sharpe you'd expect the best of N independent trials to reach by pure
 * chance, given the cross-trial variance of Sharpe estimates.
 */
export function expectedMaxSharpe(trialSharpes: number[]): number {
  const N = trialSharpes.length;
  if (N < 2) return 0;
  const v = std(trialSharpes);
  if (v === 0) return 0;
  return (
    v *
    ((1 - EULER_MASCHERONI) * normInv(1 - 1 / N) +
      EULER_MASCHERONI * normInv(1 - 1 / (N * Math.E)))
  );
}

/**
 * Deflated Sharpe Ratio: PSR measured against the expected-max-of-N-trials
 * benchmark. ~0.5 = indistinguishable from the luckiest random trial;
 * near 1 = likely a genuine edge even after multiple testing.
 */
export function deflatedSharpe(
  sr: number,
  T: number,
  skew: number,
  kurt: number,
  trialSharpes: number[],
): number {
  return probabilisticSharpe(sr, T, skew, kurt, expectedMaxSharpe(trialSharpes));
}

/**
 * Minimum Track Record Length: observations needed before the observed Sharpe
 * is statistically > srBenchmark at the given confidence. Infinity when the
 * observed Sharpe doesn't exceed the benchmark at all.
 */
export function minTrackRecordLength(
  sr: number,
  skew: number,
  kurt: number,
  srBenchmark = 0,
  confidence = 0.95,
): number {
  if (sr <= srBenchmark) return Infinity;
  const z = normInv(confidence);
  return (
    1 +
    (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) * (z / (sr - srBenchmark)) ** 2
  );
}
