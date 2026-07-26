// Probability of Backtest Overfitting (PBO) via Combinatorially Symmetric
// Cross-Validation (Bailey, Borwein, López de Prado & Zhu).
//
// The question PBO answers: "when I pick the best-looking parameter set
// in-sample, how often does it turn out to be *below median* out-of-sample?"
// For pure noise the answer is ~50%; for a genuine edge it approaches 0.
//
// Method: split the return history of every candidate configuration into S
// contiguous groups; enumerate every way to choose S/2 groups as in-sample
// (the complement is out-of-sample). For each split, find the best in-sample
// config and measure its out-of-sample rank. PBO is the fraction of splits
// where that rank falls in the bottom half (logit λ ≤ 0).
//
// This replaces "one walk-forward path" with C(S, S/2) paths — the repo's
// core criticism of naive backtest validation.
//
// Performance note: a naive implementation re-slices and re-scans each
// config's raw returns for every one of the C(S, S/2) splits — O(splits ×
// configs × bars). Since each group's mean/sum-of-squares never changes
// across splits, we compute those once per (config, group) — O(configs ×
// bars) — and combine the relevant groups' precomputed sums for each split
// — O(splits × configs × groups), which is far cheaper once there are more
// bars per group than there are groups (always true here: groups=8).

/** Enumerate all k-combinations of [0..n). */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const combo: number[] = [];
  const rec = (start: number) => {
    if (combo.length === k) {
      out.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      rec(i + 1);
      combo.pop();
    }
  };
  rec(0);
  return out;
}

export interface PBOResult {
  /** Fraction of splits where the in-sample winner ranked below median OOS. */
  pbo: number;
  /** Number of train/test splits evaluated. */
  splits: number;
}

/** Precomputed sum/sum-of-squares for one (config, group) — enough to derive
 *  mean and sample variance for any combination of groups without rescanning
 *  the raw returns. */
interface GroupAgg {
  count: number;
  sum: number;
  sumSq: number;
}

function computeGroupAgg(returns: number[], start: number, end: number): GroupAgg {
  let sum = 0;
  let sumSq = 0;
  for (let i = start; i < end; i++) {
    const v = returns[i];
    sum += v;
    sumSq += v * v;
  }
  return { count: end - start, sum, sumSq };
}

/** Combine precomputed group aggregates into a Sharpe-like mean/std ratio,
 *  falling back to scaled mean when std is 0 (ranks pure-drift series by
 *  drift instead of dividing by zero). */
function combineAndScore(aggs: GroupAgg[]): number {
  let count = 0;
  let sum = 0;
  let sumSq = 0;
  for (const a of aggs) {
    count += a.count;
    sum += a.sum;
    sumSq += a.sumSq;
  }
  if (count === 0) return 0;
  const m = sum / count;
  if (count < 2) return m * 1e6;
  // Sample variance via the sum-of-squares identity — mathematically the
  // same quantity metrics.ts's std() computes via a two-pass mean-subtract.
  const variance = Math.max(0, (sumSq - (sum * sum) / count) / (count - 1));
  const s = Math.sqrt(variance);
  return s === 0 ? m * 1e6 : m / s;
}

/**
 * Compute PBO from a matrix of per-bar returns, one row per candidate config
 * (all rows aligned to the same bars). `groups` must be even.
 * Returns null when there isn't enough data to say anything.
 */
export function probabilityOfBacktestOverfitting(
  returnsMatrix: number[][],
  groups = 8,
): PBOResult | null {
  const nConfigs = returnsMatrix.length;
  if (nConfigs < 3) return null;
  const nBars = returnsMatrix[0]?.length ?? 0;
  if (nBars < groups * 10) return null;

  // Contiguous group boundaries over the bar axis.
  const bounds: Array<[number, number]> = [];
  const size = Math.floor(nBars / groups);
  for (let g = 0; g < groups; g++) {
    bounds.push([g * size, g === groups - 1 ? nBars : (g + 1) * size]);
  }

  // Precompute each config's per-group aggregate exactly once.
  const groupAggs: GroupAgg[][] = returnsMatrix.map((returns) =>
    bounds.map(([a, b]) => computeGroupAgg(returns, a, b)),
  );

  const half = groups / 2;
  const splitsList = combinations(groups, half);
  let below = 0;
  let counted = 0;

  for (const trainGroups of splitsList) {
    const testGroups: number[] = [];
    for (let g = 0; g < groups; g++) {
      if (!trainGroups.includes(g)) testGroups.push(g);
    }

    // Rank configs in-sample; find the winner.
    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < nConfigs; c++) {
      const s = combineAndScore(trainGroups.map((g) => groupAggs[c][g]));
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    // The winner's out-of-sample rank relative to all configs.
    const oosScores: number[] = [];
    for (let c = 0; c < nConfigs; c++) {
      oosScores.push(combineAndScore(testGroups.map((g) => groupAggs[c][g])));
    }
    const winnerScore = oosScores[best];
    const rank = oosScores.filter((s) => s <= winnerScore).length; // 1..n
    const omega = rank / (nConfigs + 1); // relative rank in (0,1)
    // λ = logit(ω); λ ≤ 0 ⇔ winner at or below median OOS.
    if (omega <= 0.5) below++;
    counted++;
  }

  if (counted === 0) return null;
  return { pbo: below / counted, splits: counted };
}
