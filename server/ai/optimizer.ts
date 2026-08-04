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
  BotConfig,
  Candle,
  ParamSpec,
  ProposalValidation,
  StrategyParams,
} from "@shared/schema";
import { backtestStrategy, type BacktestSizing } from "../trading/backtester";
import { strategyWithParams, type Strategy } from "../trading/strategies";
import { deflatedSharpe, kurtosis, skewness } from "./metrics";
import { probabilityOfBacktestOverfitting } from "./cscv";

/** Build a realistic-sizing config from the user's live risk settings, so the
 *  optimizer's accept/reject decisions reflect what live trading would do. */
function sizingFromConfig(config: BotConfig, symbol = config.symbol): BacktestSizing {
  return {
    maxPositionPct: config.maxPositionPct,
    adaptive: config.adaptiveSizing,
    volTargetPct: config.volTargetPct,
    kellyFraction: config.kellyFraction,
    limitOrderOffsetPct: config.limitOrderOffsetPct,
    // Cost model is per asset class, so the backtest must know what it is
    // pricing — crypto fees on an equity backtest overstates its cost 5x.
    symbol,
    makerOnlyEntries: config.makerOnlyEntries,
  };
}

/** Fraction of history used for training; the rest is the held-out test set. */
const TRAIN_FRACTION = 0.65;
/**
 * Embargo: bars skipped between train and test so autocorrelated features
 * can't leak information across the boundary.
 */
const EMBARGO_BARS = 10;
/** Random candidate sets to sample from the parameter space. */
const SAMPLES = 120;
/** A candidate must beat the baseline out-of-sample by at least this much. */
const MIN_IMPROVEMENT = 0.01; // 1 percentage point of return
/**
 * Probability-of-Backtest-Overfitting ceiling (per the CSCV literature):
 * if the in-sample winner ranks below median OOS in more than 5% of
 * combinatorial splits, the "improvement" is presumed overfit and rejected.
 */
const PBO_MAX = 0.05;

export interface OptimizationOutcome {
  strategyId: string;
  /** Best params found. Null when nothing beat the current params OOS. */
  bestParams: StrategyParams | null;
  validation: ProposalValidation | null;
}

function scoreOf(
  strategy: Strategy,
  params: StrategyParams,
  candles: Candle[],
  sizing?: BacktestSizing,
) {
  const result = backtestStrategy(
    strategyWithParams(strategy, params),
    candles,
    10_000,
    0.03,
    0.06,
    sizing,
  );
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
  config?: BotConfig,
): OptimizationOutcome {
  const specs = strategy.meta.params;
  if (candles.length < 120 || specs.length === 0) {
    return { strategyId: strategy.meta.id, bestParams: null, validation: null };
  }

  // Score with the user's actual live risk/sizing settings, when available,
  // so the accept/reject decision reflects what live trading would actually
  // do — not an unrelated flat-sizing fiction.
  const sizing = config ? sizingFromConfig(config) : undefined;

  const split = Math.floor(candles.length * TRAIN_FRACTION);
  const train = candles.slice(0, split);
  // Embargo: leave a gap after the training window before testing begins.
  const test = candles.slice(Math.min(candles.length, split + EMBARGO_BARS));

  const rand = mulberry32(candles.length + specs.length * 7919);

  // 1. Search the training window (include current params as a candidate).
  const candidates: StrategyParams[] = [currentParams];
  let best: StrategyParams = currentParams;
  let bestResult = scoreOf(strategy, currentParams, train, sizing);
  for (let i = 0; i < SAMPLES; i++) {
    const cand = randomParams(specs, rand);
    candidates.push(cand);
    const s = scoreOf(strategy, cand, train, sizing);
    if (s.score > bestResult.score) {
      bestResult = s;
      best = cand;
    }
  }

  // 2. Validate on the held-out test window.
  const candidateOos = scoreOf(strategy, best, test, sizing);
  const baselineOos = scoreOf(strategy, currentParams, test, sizing);
  const improvement = candidateOos.returnPct - baselineOos.returnPct;

  const validation: ProposalValidation = {
    // Reuses the winner's already-computed training-window result instead
    // of re-running an identical backtest.
    inSampleReturn: bestResult.returnPct,
    outOfSampleReturn: candidateOos.returnPct,
    baselineOutOfSampleReturn: baselineOos.returnPct,
    improvement,
    outOfSampleTrades: candidateOos.trades,
  };

  // 3. Only accept a genuine, out-of-sample, adequately-traded improvement.
  const sameAsCurrent = specs.every(
    (s) => Math.abs((best[s.key] ?? 0) - (currentParams[s.key] ?? 0)) < 1e-9,
  );
  let accept =
    !sameAsCurrent &&
    improvement >= MIN_IMPROVEMENT &&
    candidateOos.returnPct > 0 &&
    candidateOos.trades >= 3;

  // 4. Overfitting audit (only when the candidate would otherwise pass):
  //    backtest EVERY candidate over the full history, then ask via CSCV how
  //    often the in-sample winner would rank below median out-of-sample (PBO),
  //    and deflate the winner's Sharpe for the number of trials searched.
  if (accept) {
    const fullRuns = candidates.map(
      (p) => backtestStrategy(strategyWithParams(strategy, p), candles, 10_000, 0.03, 0.06, sizing),
    );
    const matrix = fullRuns.map((r) => r.returns ?? []);
    const pboResult = probabilityOfBacktestOverfitting(matrix, 8);

    const bestIdx = candidates.indexOf(best);
    const bestReturns = matrix[bestIdx] ?? [];
    const trialSharpes = fullRuns.map((r) => r.sharpe);
    const dsr =
      bestReturns.length > 2
        ? deflatedSharpe(
            fullRuns[bestIdx].sharpe,
            bestReturns.length,
            skewness(bestReturns),
            kurtosis(bestReturns),
            trialSharpes,
          )
        : undefined;

    if (pboResult) validation.pbo = pboResult.pbo;
    if (dsr !== undefined) validation.deflatedSharpe = dsr;
    // The literature's rule: reject when overfit probability exceeds 5%.
    if (pboResult && pboResult.pbo > PBO_MAX) accept = false;
  }

  return {
    strategyId: strategy.meta.id,
    bestParams: accept ? best : null,
    validation,
  };
}
