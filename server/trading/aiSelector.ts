// AI strategy selector. Rather than trusting one strategy blindly, the platform
// continuously (a) classifies the current market regime and (b) backtests every
// strategy on the most recent window, then scores each strategy by combining
// its recent risk-adjusted performance with how well it fits the current
// regime. The highest scorer becomes active.
//
// This is deliberately deterministic and explainable — no opaque model, no
// self-modifying code. "AI" here means adaptive, data-driven selection you can
// read in the decision log. It's the safe end of automation: the strategies
// themselves are fixed and audited; only the choice between them adapts.

import type { Candle, MarketRegime, StrategyScore } from "@shared/schema";
import { sma, atr } from "./indicators";
import { STRATEGY_LIST, type Strategy } from "./strategies";
import { backtestStrategy } from "./backtester";

export type { StrategyScore };

export interface SelectionResult {
  regime: MarketRegime;
  chosen: Strategy;
  scores: StrategyScore[];
  rationale: string;
}

/**
 * Classify the market regime from recent candles using trend slope and
 * volatility. Cheap, transparent, and good enough to bias strategy choice.
 */
export function detectRegime(candles: Candle[]): MarketRegime {
  const closes = candles.map((c) => c.close);
  const fast = sma(closes, 20);
  const slow = sma(closes, 50);
  const price = closes[closes.length - 1];
  const vol = atr(
    candles.map((c) => c.high),
    candles.map((c) => c.low),
    closes,
    14,
  );
  const volPct = vol && price ? vol / price : 0;

  // High volatility dominates the classification.
  if (volPct > 0.006) return "volatile";
  if (fast !== null && slow !== null) {
    const spread = (fast - slow) / slow;
    if (spread > 0.004) return "trending_up";
    if (spread < -0.004) return "trending_down";
  }
  return "ranging";
}

/**
 * How much better a challenger must score than the strategy currently running
 * before we actually switch.
 *
 * Selection here is IN-SAMPLE: every strategy is scored by backtesting it on
 * the same recent window we are about to trade forward from, and the winner is
 * the maximum of several noisy estimates — which systematically picks whichever
 * strategy got luckiest rather than whichever is best. Switching on every tiny
 * lead therefore means chasing what just worked, and paying entry/exit costs
 * for the privilege.
 *
 * RAISED FROM 4 TO 12 ON EVIDENCE. Walk-forward measurement over 20 independent
 * price paths, ranked on 10 and confirmed on 10 unseen ones
 * (trading/marginEval.ts), found switching frequency dominated everything else
 * about selection:
 *
 *     margin    validate return    switches per run
 *        4          83.90%              2.9
 *        8          88.25%              0.9
 *       12          92.61%              0.4
 *       20          94.76%              0.2
 *       40          91.70%              0.1
 *
 * At margin 4 the selector trailed simply holding the best fixed strategy by
 * 14.10pp (t=-3.36, significant). At margin 20 that gap fell to 3.25pp
 * (t=-1.08, no longer distinguishable from noise). So most of what looked like
 * bad strategy CHOICE was really churn.
 *
 * THAT EVIDENCE DID NOT REPLICATE, and the reason matters more than the
 * setting. The price generator those runs used had lag-1 return
 * autocorrelation of +0.12, which hands trend-following a free edge no real
 * market provides — see marketData.ts. After the generator was rebuilt to
 * satisfy the empirical stylized facts (npm run facts), the same sweep gives:
 *
 *     margin    validate    switches
 *        4      -15.75%       4.1
 *        8      -16.53%       1.8
 *       12      -17.70%       1.1
 *       20      -17.97%       0.6
 *
 * Every setting loses money, the ordering has reversed, and every difference
 * is inside the noise (|t| <= 1.67). The earlier "+10.86pp at margin 20" was
 * measuring an artifact.
 *
 * 12 IS KEPT ANYWAY, on the argument rather than the discredited measurement:
 * each switch pays a round trip, round trips cost 0.60% on crypto, and nothing
 * in either generator showed switching earning that back. Fewer switches is
 * the cheaper default when the benefit is unproven. It is no longer presented
 * as an evidence-backed optimum, because it is not one.
 */
export const SWITCH_MARGIN = 12;

/**
 * Bonus applied to a strategy suited to the current regime.
 *
 * HISTORY, because this interacts with SWITCH_MARGIN in a way that already
 * caused one bug: when the two were both 8, a challenger whose only advantage
 * was fitting the regime could never clear the hysteresis, so regime detection
 * was structurally unable to change anything. Observed live — in a "ranging"
 * market the engine sat on SMA Trend with 0 trades instead of switching to RSI
 * Mean Reversion, blocked by 0.36 of a point.
 *
 * That deadlock is now prevented by the zero-trade exemption below rather than
 * by the ordering of these two constants: an incumbent that has produced no
 * trades has no record to protect and gets no hysteresis at all, so it can
 * always be replaced however large the margin is.
 *
 * The deliberate consequence of margin (12) now exceeding this bonus (8) is
 * that regime fit ALONE no longer flips an incumbent that is actively trading.
 * Given the measurement above — switching costs more than it gains — that is
 * the intended behaviour, not an oversight. Regime fit still decides the
 * initial pick and breaks ties.
 */
export const REGIME_FIT_BONUS = 8;

/**
 * Score and rank all strategies on the given history. Score blends
 * risk-adjusted return with regime fit; drawdown is penalized so a strategy
 * can't win purely by taking big risks.
 *
 * Pass `currentStrategyId` to apply switching hysteresis: the incumbent is
 * kept unless a rival beats it by at least `margin`.
 */
export function selectStrategy(
  candles: Candle[],
  currentStrategyId?: string,
  margin = SWITCH_MARGIN,
): SelectionResult {
  const regime = detectRegime(candles);
  const scores: StrategyScore[] = STRATEGY_LIST.map((strategy) => {
    const result = backtestStrategy(strategy, candles);
    const { stats } = result;
    const regimeFit = strategy.meta.bestRegimes.includes(regime);

    // Base score: return minus a drawdown penalty, nudged by win rate.
    let score =
      result.returnPct * 100 -
      stats.maxDrawdown * 40 +
      (stats.winRate - 0.5) * 10;
    // Reward strategies suited to the current regime.
    if (regimeFit) score += REGIME_FIT_BONUS;
    // Distrust results from too few trades (statistically weak).
    if (stats.totalTrades < 3) score -= 10;

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

  // Hysteresis: keep the incumbent unless a rival is decisively ahead.
  let top = scores[0];
  let held = false;
  if (currentStrategyId && top.strategyId !== currentStrategyId) {
    const incumbent = scores.find((s) => s.strategyId === currentStrategyId);
    // Hysteresis exists to stop us flip-flopping between strategies that are
    // BOTH working. An incumbent that produced no trades at all over the
    // window has no track record to protect — keeping it just means sitting
    // idle forever — so it gets no protection.
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
      `no rival is clearly ahead (needs a ${margin}-point edge to justify switching).`
    : `Market looks ${regime.replace("_", " ")}. ` +
      `Chose ${top.strategyName} (recent return ${(top.returnPct * 100).toFixed(
        1,
      )}%, win rate ${(top.winRate * 100).toFixed(0)}%, ` +
      `${top.trades} trades${top.regimeFit ? ", fits regime" : ""}).`;

  return { regime, chosen, scores, rationale };
}
