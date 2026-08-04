// Proof-of-expectancy gate — may this strategy trade REAL money yet?
//
// WHY THIS EXISTS. Every measurement in this project points the same way: on a
// realistic price process, all three technical strategies lose, and the best
// available outcome is the ML model's, which is to decline to trade at all.
//
//     policy                    return
//     ML Signal Model            0.00%   <- refuses to trade
//     OOS selection            -10.05%
//     in-sample selection      -14.17%
//     best technical strategy  -12.89%
//
// The ML model gets that right for a specific reason: signalModel.isTradable()
// refuses unless validation accuracy beats the majority-class baseline by a
// margin. Nothing equivalent guards the technical strategies, so a rule with
// demonstrated NEGATIVE expectancy will happily trade a live account.
//
// This generalises that guard to every strategy, on the only currency that
// matters: realised profit after costs.
//
// THE BAR IS DELIBERATELY LOW, and it is a floor rather than a target. It does
// not ask for a good strategy. It asks for evidence that this one is not
// actively losing — a positive mean return per trade, over enough trades for
// that mean to mean anything, net of the costs actually charged. A rule that
// cannot clear "better than zero on its own recent record" has no business
// sizing real money.
//
// PAPER TRADING IS NEVER GATED. Gathering the evidence requires taking the
// trades, so blocking paper mode would make the gate unsatisfiable — the
// classic bootstrap failure where a safety check prevents the thing that would
// satisfy it. This applies to live mode only.

import type { Trade } from "@shared/schema";
import { roundTripCost } from "./costs";

export interface ExpectancyVerdict {
  /** May this strategy open new LIVE positions? */
  proven: boolean;
  trades: number;
  /** Mean realised return per trade, as a fraction. */
  meanReturn: number;
  /** t statistic of mean return against zero. */
  t: number;
  /** Round-trip cost the trades had to clear. */
  costPerTrade: number;
  reason: string;
}

/** Trades needed before a mean return is worth reading at all. */
export const MIN_TRADES = 30;
/**
 * t threshold for "distinguishable from zero".
 *
 * 1.7 is roughly p<0.05 one-tailed at n=30. One-tailed because the question is
 * strictly "is this better than nothing", not "is it different from nothing" —
 * a strategy that is significantly WORSE than zero fails either way.
 */
export const MIN_T = 1.7;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0;
}

/**
 * Has `strategyId` demonstrated positive expectancy on its own recent record?
 *
 * Reads REALISED trades, not backtests. A backtest can be re-run until it
 * agrees with you; a realised trade cannot.
 */
export function assessExpectancy(
  trades: Trade[],
  strategyId: string,
  symbol: string,
  minTrades = MIN_TRADES,
): ExpectancyVerdict {
  const relevant = trades.filter((t) => t.strategy === strategyId).slice(-200);
  const returns = relevant.map((t) => t.returnPct);
  const costPerTrade = roundTripCost(symbol, false);

  if (relevant.length < minTrades) {
    return {
      proven: false,
      trades: relevant.length,
      meanReturn: mean(returns),
      t: 0,
      costPerTrade,
      reason:
        `${relevant.length}/${minTrades} trades — not enough evidence to tell ` +
        `profit from luck yet`,
    };
  }

  const m = mean(returns);
  const variance =
    returns.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, returns.length - 1);
  const se = Math.sqrt(variance / returns.length);
  const t = se > 0 ? m / se : 0;

  if (m <= 0) {
    return {
      proven: false,
      trades: relevant.length,
      meanReturn: m,
      t,
      costPerTrade,
      reason:
        `mean ${(m * 100).toFixed(3)}% per trade over ${relevant.length} — ` +
        `losing money, not merely unproven`,
    };
  }
  if (t < MIN_T) {
    return {
      proven: false,
      trades: relevant.length,
      meanReturn: m,
      t,
      costPerTrade,
      reason:
        `mean +${(m * 100).toFixed(3)}% per trade but t=${t.toFixed(2)} — ` +
        `indistinguishable from luck (need t > ${MIN_T})`,
    };
  }

  return {
    proven: true,
    trades: relevant.length,
    meanReturn: m,
    t,
    costPerTrade,
    reason:
      `+${(m * 100).toFixed(3)}% per trade over ${relevant.length} trades, ` +
      `t=${t.toFixed(2)} — clears the bar`,
  };
}
