// Purged, embargoed walk-forward cross-validation (after López de Prado).
//
// Why this exists: in time-series ML, ordinary random cross-validation leaks
// the future into the past. Two subtler leaks remain even with a simple
// chronological split:
//   - Purge: a training sample's label is computed from bars up to `horizon`
//     ahead. If that window overlaps the validation set, the label "saw" the
//     validation period. We drop those overlapping training samples.
//   - Embargo: features are autocorrelated across adjacent bars, so we also
//     skip a small buffer right before each validation block.
//
// The result is an honest, leak-free estimate of out-of-sample accuracy — the
// number you can actually trust when deciding whether the model has an edge.

import {
  accuracy,
  fitStandardizer,
  standardize,
  trainLogistic,
} from "./logistic";

export interface WalkForwardOptions {
  folds: number;
  /** Samples to purge/embargo around each validation boundary. */
  purge: number;
}

/**
 * Run walk-forward CV over a chronologically-ordered dataset and return the
 * mean out-of-sample accuracy across folds. Each fold trains on all data before
 * a validation block (minus the purge buffer) and tests on that block.
 */
export function purgedWalkForwardAccuracy(
  X: number[][],
  y: number[],
  opts: WalkForwardOptions,
): { accuracy: number; folds: number } {
  const n = X.length;
  const folds = Math.max(2, opts.folds);
  const blockSize = Math.floor(n / (folds + 1)); // first block is train-only
  if (blockSize < 20) {
    return { accuracy: 0, folds: 0 };
  }

  const accs: number[] = [];
  for (let f = 1; f <= folds; f++) {
    const valStart = f * blockSize;
    const valEnd = f === folds ? n : valStart + blockSize;
    // Training data ends `purge` samples before validation begins.
    const trainEnd = Math.max(0, valStart - opts.purge);
    if (trainEnd < 40) continue;

    const Xtr = X.slice(0, trainEnd);
    const ytr = y.slice(0, trainEnd);
    const Xva = X.slice(valStart, valEnd);
    const yva = y.slice(valStart, valEnd);
    if (Xva.length < 10) continue;

    // Standardize using training stats only.
    const stats = fitStandardizer(Xtr);
    const XtrS = Xtr.map((r) => standardize(r, stats));
    const XvaS = Xva.map((r) => standardize(r, stats));
    const model = trainLogistic(XtrS, ytr, { iterations: 400, learningRate: 0.1, l2: 1e-3 });
    accs.push(accuracy(model, XvaS, yva));
  }

  if (accs.length === 0) return { accuracy: 0, folds: 0 };
  return {
    accuracy: accs.reduce((a, b) => a + b, 0) / accs.length,
    folds: accs.length,
  };
}
