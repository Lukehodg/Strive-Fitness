// Strategy library. Each strategy is a pure function from recent candles to a
// Signal, plus metadata describing which market regimes it suits. Keeping them
// pure means the same code drives both live evaluation and backtesting.

import type { Candle, Signal, StrategyMeta } from "@shared/schema";
import { sma, rsi, highest, lowest } from "./indicators";

export interface Strategy {
  meta: StrategyMeta;
  /**
   * Evaluate the newest bar. `candles` is chronological (oldest first) and
   * ends at the bar being decided. `hasPosition` lets a strategy decide
   * whether it's looking for an entry or an exit.
   */
  evaluate(candles: Candle[], hasPosition: boolean): Signal;
}

const HOLD: Signal = { action: "hold", strength: 0, reason: "No setup" };

function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

// ---------------------------------------------------------------------------
// 1. SMA trend-following (fast/slow moving-average crossover)
// ---------------------------------------------------------------------------

const FAST = 10;
const SLOW = 30;

const smaTrend: Strategy = {
  meta: {
    id: "sma_trend",
    name: "SMA Trend Following",
    description:
      "Goes long when the fast moving average crosses above the slow one and exits when it crosses back below. Rides sustained trends.",
    bestRegimes: ["trending_up"],
  },
  evaluate(candles, hasPosition) {
    const c = closes(candles);
    const fastNow = sma(c, FAST);
    const slowNow = sma(c, SLOW);
    const fastPrev = sma(c.slice(0, -1), FAST);
    const slowPrev = sma(c.slice(0, -1), SLOW);
    if (
      fastNow === null ||
      slowNow === null ||
      fastPrev === null ||
      slowPrev === null
    ) {
      return HOLD;
    }
    const crossedUp = fastPrev <= slowPrev && fastNow > slowNow;
    const crossedDown = fastPrev >= slowPrev && fastNow < slowNow;
    const gap = Math.abs(fastNow - slowNow) / slowNow;
    const strength = Math.min(1, gap * 20);

    if (!hasPosition && crossedUp) {
      return {
        action: "buy",
        strength: Math.max(0.4, strength),
        reason: `Fast SMA(${FAST}) crossed above slow SMA(${SLOW})`,
      };
    }
    if (hasPosition && crossedDown) {
      return {
        action: "sell",
        strength: 1,
        reason: `Fast SMA(${FAST}) crossed below slow SMA(${SLOW})`,
      };
    }
    return HOLD;
  },
};

// ---------------------------------------------------------------------------
// 2. RSI mean-reversion (buy oversold, sell overbought)
// ---------------------------------------------------------------------------

const RSI_PERIOD = 14;
const OVERSOLD = 30;
const OVERBOUGHT = 60;

const rsiReversion: Strategy = {
  meta: {
    id: "rsi_reversion",
    name: "RSI Mean Reversion",
    description:
      "Buys when RSI signals oversold and sells when it recovers to overbought. Profits from choppy, range-bound markets.",
    bestRegimes: ["ranging"],
  },
  evaluate(candles, hasPosition) {
    const c = closes(candles);
    const value = rsi(c, RSI_PERIOD);
    if (value === null) return HOLD;

    if (!hasPosition && value < OVERSOLD) {
      const strength = Math.min(1, (OVERSOLD - value) / OVERSOLD + 0.4);
      return {
        action: "buy",
        strength,
        reason: `RSI(${RSI_PERIOD}) at ${value.toFixed(1)} — oversold`,
      };
    }
    if (hasPosition && value > OVERBOUGHT) {
      return {
        action: "sell",
        strength: 1,
        reason: `RSI(${RSI_PERIOD}) at ${value.toFixed(1)} — recovered`,
      };
    }
    return HOLD;
  },
};

// ---------------------------------------------------------------------------
// 3. Breakout / momentum (Donchian channel)
// ---------------------------------------------------------------------------

const BREAKOUT_LOOKBACK = 20;
const EXIT_LOOKBACK = 10;

const breakout: Strategy = {
  meta: {
    id: "breakout",
    name: "Breakout Momentum",
    description:
      "Enters when price breaks above its recent high (a new N-bar high) and exits when it falls below its recent low. Captures explosive moves.",
    bestRegimes: ["trending_up", "volatile"],
  },
  evaluate(candles, hasPosition) {
    const c = closes(candles);
    if (c.length < BREAKOUT_LOOKBACK + 1) return HOLD;
    const price = c[c.length - 1];
    // Use bars up to (but not including) the current one for the channel.
    const prior = c.slice(0, -1);
    const upper = highest(prior, BREAKOUT_LOOKBACK);
    const lower = lowest(prior, EXIT_LOOKBACK);
    if (upper === null || lower === null) return HOLD;

    if (!hasPosition && price > upper) {
      const strength = Math.min(1, (price - upper) / upper * 30 + 0.5);
      return {
        action: "buy",
        strength,
        reason: `Price broke above ${BREAKOUT_LOOKBACK}-bar high (${upper.toFixed(2)})`,
      };
    }
    if (hasPosition && price < lower) {
      return {
        action: "sell",
        strength: 1,
        reason: `Price fell below ${EXIT_LOOKBACK}-bar low (${lower.toFixed(2)})`,
      };
    }
    return HOLD;
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const STRATEGIES: Record<string, Strategy> = {
  [smaTrend.meta.id]: smaTrend,
  [rsiReversion.meta.id]: rsiReversion,
  [breakout.meta.id]: breakout,
};

export const STRATEGY_LIST: Strategy[] = Object.values(STRATEGIES);

export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES[id];
}
