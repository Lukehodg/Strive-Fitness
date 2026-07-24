// A small, dependency-free logistic-regression classifier trained by batch
// gradient descent with L2 regularization. This is a genuine trainable ML model
// — it just happens to be a simple, robust one. Its linear form is a feature,
// not a limitation: the learned weight on each (standardized) input is directly
// interpretable as that feature's importance and direction.

export interface LogisticModel {
  weights: number[];
  bias: number;
}

export interface TrainOptions {
  iterations?: number;
  learningRate?: number;
  /** L2 regularization strength — higher = simpler model, less overfitting. */
  l2?: number;
}

function sigmoid(z: number): number {
  if (z < -30) return 0;
  if (z > 30) return 1;
  return 1 / (1 + Math.exp(-z));
}

export function predictProba(model: LogisticModel, x: number[]): number {
  let z = model.bias;
  for (let j = 0; j < x.length; j++) z += model.weights[j] * x[j];
  return sigmoid(z);
}

/**
 * Fit a logistic model to standardized features `X` and binary labels `y`.
 * Assumes X is already standardized (zero mean, unit variance per column).
 */
export function trainLogistic(
  X: number[][],
  y: number[],
  opts: TrainOptions = {},
): LogisticModel {
  const iterations = opts.iterations ?? 400;
  const lr = opts.learningRate ?? 0.1;
  const l2 = opts.l2 ?? 1e-3;
  const n = X.length;
  const d = n > 0 ? X[0].length : 0;
  const model: LogisticModel = { weights: new Array(d).fill(0), bias: 0 };
  if (n === 0) return model;

  for (let it = 0; it < iterations; it++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const p = predictProba(model, X[i]);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;
    }
    for (let j = 0; j < d; j++) {
      // Average gradient + L2 penalty (bias is not regularized).
      model.weights[j] -= lr * (gradW[j] / n + l2 * model.weights[j]);
    }
    model.bias -= lr * (gradB / n);
  }
  return model;
}

export interface StandardizeStats {
  mean: number[];
  std: number[];
}

/** Compute per-column mean and std for standardization. */
export function fitStandardizer(X: number[][]): StandardizeStats {
  const d = X[0]?.length ?? 0;
  const mean = new Array(d).fill(0);
  const std = new Array(d).fill(0);
  const n = X.length;
  if (n === 0) return { mean, std };
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j];
  for (let j = 0; j < d; j++) mean[j] /= n;
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2;
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / n) || 1; // avoid /0
  return { mean, std };
}

export function standardize(x: number[], stats: StandardizeStats): number[] {
  return x.map((v, j) => (v - stats.mean[j]) / stats.std[j]);
}

/** Classification accuracy of a model over a (standardized) dataset. */
export function accuracy(
  model: LogisticModel,
  X: number[][],
  y: number[],
): number {
  if (X.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const pred = predictProba(model, X[i]) >= 0.5 ? 1 : 0;
    if (pred === y[i]) correct++;
  }
  return correct / X.length;
}
