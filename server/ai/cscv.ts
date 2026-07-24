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

import { mean, std } from "./metrics";

/** Score used to rank configs within a window: Sharpe, falling back to mean. */
function windowScore(returns: number[]): number {
  const s = std(returns);
  if (s === 0) return mean(returns) * 1e6; // rank pure-drift series by drift
  return mean(returns) / s;
}

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

  const slice = (config: number, groupIdx: number[]): number[] => {
    const out: number[] = [];
    for (const g of groupIdx) {
      const [a, b] = bounds[g];
      for (let i = a; i < b; i++) out.push(returnsMatrix[config][i]);
    }
    return out;
  };

  const half = groups / 2;
  const splitsList = combinations(groups, half);
  let below = 0;
  let counted = 0;

  for (const trainGroups of splitsList) {
    const testGroups = [];
    for (let g = 0; g < groups; g++) {
      if (!trainGroups.includes(g)) testGroups.push(g);
    }

    // Rank configs in-sample; find the winner.
    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < nConfigs; c++) {
      const s = windowScore(slice(c, trainGroups));
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }

    // The winner's out-of-sample rank relative to all configs.
    const oosScores = [];
    for (let c = 0; c < nConfigs; c++) {
      oosScores.push(windowScore(slice(c, testGroups)));
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
