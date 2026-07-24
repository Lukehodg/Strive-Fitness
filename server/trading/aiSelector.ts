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
 * Score and rank all strategies on the given history. Score blends
 * risk-adjusted return with regime fit; drawdown is penalized so a strategy
 * can't win purely by taking big risks.
 */
export function selectStrategy(candles: Candle[]): SelectionResult {
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
    if (regimeFit) score += 8;
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

  const top = scores[0];
  const chosen =
    STRATEGY_LIST.find((s) => s.meta.id === top.strategyId) ?? STRATEGY_LIST[0];

  const rationale =
    `Market looks ${regime.replace("_", " ")}. ` +
    `Chose ${top.strategyName} (recent return ${(top.returnPct * 100).toFixed(
      1,
    )}%, win rate ${(top.winRate * 100).toFixed(0)}%, ` +
    `${top.trades} trades${top.regimeFit ? ", fits regime" : ""}).`;

  return { regime, chosen, scores, rationale };
}
