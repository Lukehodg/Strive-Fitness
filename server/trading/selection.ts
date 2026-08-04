// Out-of-sample strategy selection — NOT IN USE, and the reason has changed.
//
// ============================================================================
// THIS IS NOT WIRED INTO THE ENGINE, but it is no longer because it failed.
// It was written off as a failure on measurements that turned out to be an
// artifact of the price generator, and re-measuring reversed the verdict.
//
// The hypothesis: score strategies on consistency across sub-periods instead of
// on one total, and selection would generalise better. Measured against the
// existing selector over 20 independent price paths (trading/selectionEval.ts
// and selectionSweep.ts), ranked on 10 and confirmed on 10 unseen:
//
// ON THE OLD GENERATOR it looked decisively bad: 35.20% vs 67.92% (t=-4.90),
// switching 8 times a run against the incumbent's 2.4. Tuned as far as it
// would go it drew level and no further (+0.39pp, t=0.11).
//
// ON A REALISTIC PRICE PROCESS IT WINS. The old generator had +0.12 lag-1
// return autocorrelation, which rewards chasing whichever strategy most
// recently worked — precisely what the incumbent in-sample selector does. Once
// that free momentum was removed (see marketData.ts), the same comparison over
// the same 12 paths gives:
//
//     OOS (held-out folds)   -10.05%
//     CURRENT (in-sample)    -14.17%
//     OOS vs CURRENT         +4.12pp   t=2.68   BETTER (clears |t| > 2.2)
//
// A complete reversal, and it makes sense: scoring by consistency across
// sub-periods beats chasing the recent winner exactly when recent winners stop
// persisting, which is the realistic case.
//
// IT IS STILL NOT WIRED IN, for a reason that has nothing to do with the
// comparison above. On the same paths, the best available policy is the ML
// model, which declines to trade at all, at 0.00%. Both selectors lose about
// 10-14% to doing nothing. Swapping a losing selector for a less-losing one is
// not an improvement worth shipping; the honest response is the no-trade gate
// in riskManager.ts, not a better way to pick among strategies that do not work.
//
// The lesson worth keeping is no longer "scoring did not matter". It is that a
// measurement is only as good as the data generator under it, and a negative
// result deserves the same scepticism as a positive one.
// ============================================================================
//
// WHAT WAS WRONG WITH THE OLD ONE. aiSelector.selectStrategy() backtests every
// strategy over the same recent window it is about to trade forward from, and
// picks the highest total return. With fixed-parameter strategies there is no
// curve-fitting in the usual sense, but there is a subtler and equally
// destructive bias: taking the MAXIMUM of N noisy estimates systematically
// selects whichever strategy got luckiest, not whichever is best. One
// well-timed move inside the window is enough to win, and that move is exactly
// the thing that will not repeat. The result is a selector that chases what
// just worked and switches after the edge has gone.
//
// WHAT THIS DOES INSTEAD. Split the window into consecutive sub-periods and
// ask a different question: was this strategy good REPEATEDLY? A strategy
// carried by a single lucky block scores badly here, because the other blocks
// drag it down and its dispersion is penalised. That is the whole idea —
// consistency across sub-periods survives out-of-sample far better than a
// single total does.
//
// Two further corrections, both aimed at the same bias:
//
//   SHRINKAGE. An estimate from few trades is mostly noise, so each score is
//   pulled toward zero by a factor n/(n+k). This is the standard remedy for
//   picking the best of several noisy means, and it stops a 2-trade fluke
//   outranking a 40-trade record.
//
//   DISPERSION PENALTY. Spread across sub-periods is subtracted, so "+20% then
//   -18%" loses to a steady "+1% each time" — the second is far likelier to be
//   real.
//
// Per-fold results are read from ONE backtest's per-bar return series rather
// than by re-running a backtest per fold. Same cost as the old selector, and
// it keeps indicator warm-up correct: each fold inherits a settled state from
// the bars before it, which re-running on a bare 200-bar slice would not.

import type { Candle, MarketRegime, StrategyScore } from "@shared/schema";
import { STRATEGY_LIST, type Strategy } from "./strategies";
import { backtestStrategy } from "./backtester";
import { detectRegime, REGIME_FIT_BONUS, SWITCH_MARGIN } from "./aiSelector";
import type { SelectionResult } from "./aiSelector";

export interface OOSOptions {
  /** Sub-periods the lookback window is split into. */
  folds: number;
  /**
   * Shrinkage constant. With k trades of evidence a score keeps n/(n+k) of
   * its face value, so 5 trades is halved at k=5 and 40 barely touched.
   */
  shrinkK: number;
  /** How hard inconsistency across sub-periods is punished. */
  dispersionWeight: number;
  /** Points a challenger must lead by before a switch is worth its costs. */
  margin: number;
}

export const DEFAULT_OOS: OOSOptions = {
  folds: 3,
  shrinkK: 5,
  dispersionWeight: 0.5,
  margin: SWITCH_MARGIN,
};

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Compounded return and peak-to-trough drawdown of one block of per-bar
 * returns. Drawdown is measured WITHIN the block, so a strategy cannot hide a
 * bad stretch behind a good one elsewhere in the window.
 */
function blockStats(returns: number[]): { ret: number; drawdown: number } {
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
  }
  return { ret: equity - 1, drawdown: maxDd };
}

/**
 * Rank strategies by consistency across sub-periods rather than by total
 * return over the whole window. Drop-in replacement for selectStrategy():
 * same signature, same hysteresis, same shape of result.
 */
export function selectStrategyOOS(
  candles: Candle[],
  currentStrategyId?: string,
  opts: OOSOptions = DEFAULT_OOS,
): SelectionResult {
  const { folds: FOLDS, shrinkK: SHRINK_K, dispersionWeight: DISPERSION_WEIGHT, margin } = opts;
  const regime = detectRegime(candles);

  const scores: StrategyScore[] = STRATEGY_LIST.map((strategy) => {
    const result = backtestStrategy(strategy, candles);
    const { stats } = result;
    const regimeFit = strategy.meta.bestRegimes.includes(regime);
    const returns = result.returns ?? [];

    // Split the per-bar return series into consecutive sub-periods.
    const foldScores: number[] = [];
    const blockSize = Math.floor(returns.length / FOLDS);
    if (blockSize > 0) {
      for (let f = 0; f < FOLDS; f++) {
        const lo = f * blockSize;
        const hi = f === FOLDS - 1 ? returns.length : lo + blockSize;
        const b = blockStats(returns.slice(lo, hi));
        foldScores.push(b.ret * 100 - b.drawdown * 40);
      }
    }

    const avg = mean(foldScores);
    const spread = stdev(foldScores);
    // Evidence-weighted: few trades means the average is mostly noise.
    const shrinkage = stats.totalTrades / (stats.totalTrades + SHRINK_K);

    let score =
      avg * shrinkage -
      spread * DISPERSION_WEIGHT +
      (stats.winRate - 0.5) * 10 * shrinkage;

    if (regimeFit) score += REGIME_FIT_BONUS;

    return {
      strategyId: strategy.meta.id,
      strategyName: strategy.meta.name,
      score,
      returnPct: result.returnPct,
      winRate: stats.winRate,
      maxDrawdown: stats.maxDrawdown,
      trades: stats.totalTrades,
      regimeFit,
    };
  }).sort((a, b) => b.score - a.score);

  // Hysteresis, unchanged from the original: an incumbent with an actual
  // track record is kept unless a rival is decisively ahead. One that has
  // produced no trades has nothing to protect and gets no protection.
  let top = scores[0];
  let held = false;
  if (currentStrategyId && top.strategyId !== currentStrategyId) {
    const incumbent = scores.find((s) => s.strategyId === currentStrategyId);
    const incumbentHasRecord = (incumbent?.trades ?? 0) > 0;
    if (incumbent && incumbentHasRecord && top.score < incumbent.score + margin) {
      top = incumbent;
      held = true;
    }
  }

  const chosen =
    STRATEGY_LIST.find((s) => s.meta.id === top.strategyId) ?? STRATEGY_LIST[0];

  const rationale = held
    ? `Market looks ${regime.replace("_", " ")}. Staying with ${top.strategyName} — ` +
      `no rival is consistently ahead across sub-periods.`
    : `Market looks ${regime.replace("_", " ")}. Chose ${top.strategyName} ` +
      `(consistent across ${FOLDS} sub-periods, ${top.trades} trades, ` +
      `win rate ${(top.winRate * 100).toFixed(0)}%${top.regimeFit ? ", fits regime" : ""}).`;

  return { regime, chosen, scores, rationale };
}
