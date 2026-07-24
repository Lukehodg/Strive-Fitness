// Walk-forward parameter optimizer.
//
// The single biggest way an automated "self-improving" strategy loses money is
// overfitting: tuning parameters until they look brilliant on past data, then
// watching them fail on new data. This optimizer defends against that by
// splitting history into a *training* window and a held-out *test* window:
//   1. Search the parameter space for the best params on the training window.
//   2. Score those params on the test window the search never saw.
//   3. Only trust the result if it also beats the current params out-of-sample.
//
// A candidate that wins in-sample but not out-of-sample is exactly the overfit
// case we refuse to act on.

import type {
  Candle,
  ParamSpec,
  ProposalValidation,
  StrategyParams,
} from "@shared/schema";
import { backtestStrategy } from "../trading/backtester";
import { strategyWithParams, type Strategy } from "../trading/strategies";

/** Fraction of history used for training; the rest is the held-out test set. */
const TRAIN_FRACTION = 0.65;
/** Random candidate sets to sample from the parameter space. */
const SAMPLES = 120;
/** A candidate must beat the baseline out-of-sample by at least this much. */
const MIN_IMPROVEMENT = 0.01; // 1 percentage point of return

export interface OptimizationOutcome {
  strategyId: string;
  /** Best params found. Null when nothing beat the current params OOS. */
  bestParams: StrategyParams | null;
  validation: ProposalValidation | null;
}

function scoreOf(strategy: Strategy, params: StrategyParams, candles: Candle[]) {
  const result = backtestStrategy(strategyWithParams(strategy, params), candles);
  // Risk-adjusted: reward return, penalize drawdown, distrust tiny samples.
  const penalty = result.stats.maxDrawdown * 0.5;
  const thin = result.stats.totalTrades < 3 ? 0.05 : 0;
  return {
    score: result.returnPct - penalty - thin,
    returnPct: result.returnPct,
    trades: result.stats.totalTrades,
  };
}

/** Draw a random value from a spec, snapped to its step grid. */
function sampleParam(spec: ParamSpec, rand: () => number): number {
  const steps = Math.max(1, Math.round((spec.max - spec.min) / spec.step));
  const n = Math.round(rand() * steps);
  return Math.min(spec.max, spec.min + n * spec.step);
}

function randomParams(specs: ParamSpec[], rand: () => number): StrategyParams {
  const p: StrategyParams = {};
  for (const s of specs) p[s.key] = sampleParam(s, rand);
  return p;
}

// Small deterministic RNG so repeated runs on the same data are reproducible.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Optimize one strategy's parameters over the given candle history. Returns the
 * best out-of-sample-validated params, or nulls when nothing genuinely beats
 * the current params.
 */
export function optimizeStrategy(
  strategy: Strategy,
  candles: Candle[],
  currentParams: StrategyParams,
): OptimizationOutcome {
  const specs = strategy.meta.params;
  if (candles.length < 120 || specs.length === 0) {
    return { strategyId: strategy.meta.id, bestParams: null, validation: null };
  }

  const split = Math.floor(candles.length * TRAIN_FRACTION);
  const train = candles.slice(0, split);
  const test = candles.slice(split);

  const rand = mulberry32(candles.length + specs.length * 7919);

  // 1. Search the training window (include current params as a candidate).
  let best: StrategyParams = currentParams;
  let bestTrainScore = scoreOf(strategy, currentParams, train).score;
  for (let i = 0; i < SAMPLES; i++) {
    const cand = randomParams(specs, rand);
    const s = scoreOf(strategy, cand, train).score;
    if (s > bestTrainScore) {
      bestTrainScore = s;
      best = cand;
    }
  }

  // 2. Validate on the held-out test window.
  const candidateOos = scoreOf(strategy, best, test);
  const baselineOos = scoreOf(strategy, currentParams, test);
  const improvement = candidateOos.returnPct - baselineOos.returnPct;

  const validation: ProposalValidation = {
    inSampleReturn: scoreOf(strategy, best, train).returnPct,
    outOfSampleReturn: candidateOos.returnPct,
    baselineOutOfSampleReturn: baselineOos.returnPct,
    improvement,
    outOfSampleTrades: candidateOos.trades,
  };

  // 3. Only accept a genuine, out-of-sample, adequately-traded improvement.
  const sameAsCurrent = specs.every(
    (s) => Math.abs((best[s.key] ?? 0) - (currentParams[s.key] ?? 0)) < 1e-9,
  );
  const accept =
    !sameAsCurrent &&
    improvement >= MIN_IMPROVEMENT &&
    candidateOos.returnPct > 0 &&
    candidateOos.trades >= 3;

  return {
    strategyId: strategy.meta.id,
    bestParams: accept ? best : null,
    validation,
  };
}
