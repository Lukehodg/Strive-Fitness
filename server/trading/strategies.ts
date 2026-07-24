// Strategy library. Each strategy is defined once as a pure function of
// (params, candles, hasPosition) → Signal, plus a parameter space describing
// which numbers the optimizer is allowed to tune and within what bounds.
//
// The same definition drives three things:
//   - live evaluation, using the strategy's *active* params (tunable at runtime)
//   - backtesting / optimization, using any candidate params
//   - the UI, which renders the param space and current values
//
// Keeping strategies pure and parameterized is what makes safe self-improvement
// possible: the algorithm is fixed and audited; only bounded numeric params
// change, and every change is validated out-of-sample before it's trusted.

import type {
  Candle,
  ParamSpec,
  Signal,
  StrategyMeta,
  StrategyParams,
} from "@shared/schema";
import { sma, rsi, highest, lowest } from "./indicators";
import { signalModel } from "../ml/signalModel";
import { registerPersistence, schedulePersist } from "../persistence";

export interface Strategy {
  meta: StrategyMeta;
  /** Evaluate the newest bar using the strategy's current active params. */
  evaluate(candles: Candle[], hasPosition: boolean): Signal;
  /** Evaluate with an explicit param set (used by the optimizer/backtester). */
  evaluateWith(
    params: StrategyParams,
    candles: Candle[],
    hasPosition: boolean,
  ): Signal;
  defaultParams: StrategyParams;
}

type EvalFn = (
  p: StrategyParams,
  candles: Candle[],
  hasPosition: boolean,
) => Signal;

const HOLD: Signal = { action: "hold", strength: 0, reason: "No setup" };

function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

// Module-level store of each strategy's currently active params. The improver
// mutates this to apply a tuning; live evaluation always reads from here.
const activeParams = new Map<string, StrategyParams>();

/**
 * Build a Strategy from a metadata block, a parameter space, and a pure
 * evaluation function. `evaluate` reads the live active params; `evaluateWith`
 * takes params explicitly.
 */
function defineStrategy(
  base: Omit<StrategyMeta, "params">,
  params: ParamSpec[],
  evalFn: EvalFn,
): Strategy {
  const meta: StrategyMeta = { ...base, params };
  const defaults: StrategyParams = {};
  for (const p of params) defaults[p.key] = p.default;
  activeParams.set(meta.id, { ...defaults });

  return {
    meta,
    defaultParams: defaults,
    evaluate(candles, hasPosition) {
      const p = activeParams.get(meta.id) ?? defaults;
      return evalFn(p, candles, hasPosition);
    },
    evaluateWith(params, candles, hasPosition) {
      return evalFn(params, candles, hasPosition);
    },
  };
}

// ---------------------------------------------------------------------------
// 1. SMA trend-following (fast/slow moving-average crossover)
// ---------------------------------------------------------------------------

const smaTrend = defineStrategy(
  {
    id: "sma_trend",
    name: "SMA Trend Following",
    description:
      "Goes long when the fast moving average crosses above the slow one and exits when it crosses back below. Rides sustained trends.",
    bestRegimes: ["trending_up"],
  },
  [
    { key: "fast", label: "Fast MA length", min: 3, max: 25, step: 1, default: 10 },
    { key: "slow", label: "Slow MA length", min: 20, max: 80, step: 5, default: 30 },
  ],
  (p, candles, hasPosition) => {
    const fast = Math.round(p.fast);
    const slow = Math.round(p.slow);
    if (fast >= slow) return HOLD; // invalid pairing
    const c = closes(candles);
    const fastNow = sma(c, fast);
    const slowNow = sma(c, slow);
    const fastPrev = sma(c.slice(0, -1), fast);
    const slowPrev = sma(c.slice(0, -1), slow);
    if (fastNow === null || slowNow === null || fastPrev === null || slowPrev === null) {
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
        reason: `Fast SMA(${fast}) crossed above slow SMA(${slow})`,
      };
    }
    if (hasPosition && crossedDown) {
      return {
        action: "sell",
        strength: 1,
        reason: `Fast SMA(${fast}) crossed below slow SMA(${slow})`,
      };
    }
    return HOLD;
  },
);

// ---------------------------------------------------------------------------
// 2. RSI mean-reversion (buy oversold, sell overbought)
// ---------------------------------------------------------------------------

const rsiReversion = defineStrategy(
  {
    id: "rsi_reversion",
    name: "RSI Mean Reversion",
    description:
      "Buys when RSI signals oversold and sells when it recovers to overbought. Profits from choppy, range-bound markets.",
    bestRegimes: ["ranging"],
  },
  [
    { key: "period", label: "RSI period", min: 5, max: 30, step: 1, default: 14 },
    { key: "oversold", label: "Oversold level", min: 15, max: 40, step: 1, default: 30 },
    { key: "overbought", label: "Exit level", min: 50, max: 80, step: 1, default: 60 },
  ],
  (p, candles, hasPosition) => {
    const period = Math.round(p.period);
    const c = closes(candles);
    const value = rsi(c, period);
    if (value === null) return HOLD;
    if (!hasPosition && value < p.oversold) {
      const strength = Math.min(1, (p.oversold - value) / p.oversold + 0.4);
      return {
        action: "buy",
        strength,
        reason: `RSI(${period}) at ${value.toFixed(1)} — oversold`,
      };
    }
    if (hasPosition && value > p.overbought) {
      return {
        action: "sell",
        strength: 1,
        reason: `RSI(${period}) at ${value.toFixed(1)} — recovered`,
      };
    }
    return HOLD;
  },
);

// ---------------------------------------------------------------------------
// 3. Breakout / momentum (Donchian channel)
// ---------------------------------------------------------------------------

const breakout = defineStrategy(
  {
    id: "breakout",
    name: "Breakout Momentum",
    description:
      "Enters when price breaks above its recent high (a new N-bar high) and exits when it falls below its recent low. Captures explosive moves.",
    bestRegimes: ["trending_up", "volatile"],
  },
  [
    { key: "entryLookback", label: "Breakout lookback", min: 10, max: 50, step: 2, default: 20 },
    { key: "exitLookback", label: "Exit lookback", min: 5, max: 30, step: 1, default: 10 },
  ],
  (p, candles, hasPosition) => {
    const entryLookback = Math.round(p.entryLookback);
    const exitLookback = Math.round(p.exitLookback);
    const c = closes(candles);
    if (c.length < entryLookback + 1) return HOLD;
    const price = c[c.length - 1];
    const prior = c.slice(0, -1);
    const upper = highest(prior, entryLookback);
    const lower = lowest(prior, exitLookback);
    if (upper === null || lower === null) return HOLD;
    if (!hasPosition && price > upper) {
      const strength = Math.min(1, ((price - upper) / upper) * 30 + 0.5);
      return {
        action: "buy",
        strength,
        reason: `Price broke above ${entryLookback}-bar high (${upper.toFixed(2)})`,
      };
    }
    if (hasPosition && price < lower) {
      return {
        action: "sell",
        strength: 1,
        reason: `Price fell below ${exitLookback}-bar low (${lower.toFixed(2)})`,
      };
    }
    return HOLD;
  },
);

// ---------------------------------------------------------------------------
// 4. ML signal (learned logistic-regression classifier)
// ---------------------------------------------------------------------------

const mlSignal = defineStrategy(
  {
    id: "ml_signal",
    name: "ML Signal Model",
    description:
      "A trainable logistic-regression model that learns from market features (RSI, moving-average ratios, momentum, volatility) to predict the probability of a price rise, and trades on that probability. Only trades when its out-of-sample accuracy beats chance.",
    bestRegimes: ["trending_up", "ranging", "volatile"],
  },
  [
    { key: "buyThreshold", label: "Buy probability", min: 0.5, max: 0.75, step: 0.01, default: 0.55 },
    { key: "exitThreshold", label: "Exit probability", min: 0.3, max: 0.5, step: 0.01, default: 0.45 },
  ],
  (p, candles, hasPosition) => {
    // Safety gate: an untrained or coin-flip model produces no signals.
    if (!signalModel.isTradable()) return HOLD;
    const pred = signalModel.predictWithMeta(candles);
    if (pred === null) return HOLD;
    const { prob, metaConfidence, approved } = pred;

    if (!hasPosition && prob >= p.buyThreshold) {
      // Meta-labeling: veto signals the meta model thinks are wrong, and use
      // its confidence as the bet size when it approves.
      if (!approved) {
        return {
          action: "hold",
          strength: 0,
          reason: `Signal vetoed by meta-model (${((metaConfidence ?? 0) * 100).toFixed(0)}% confidence)`,
        };
      }
      const strength =
        metaConfidence !== null
          ? metaConfidence
          : Math.min(1, (prob - p.buyThreshold) / (1 - p.buyThreshold) + 0.4);
      return {
        action: "buy",
        strength,
        reason:
          `Model predicts ${(prob * 100).toFixed(0)}% chance of a rise` +
          (metaConfidence !== null
            ? `; meta sizes bet at ${(metaConfidence * 100).toFixed(0)}%`
            : ""),
      };
    }
    if (hasPosition && prob <= p.exitThreshold) {
      return {
        action: "sell",
        strength: 1,
        reason: `Model confidence fell to ${(prob * 100).toFixed(0)}%`,
      };
    }
    return HOLD;
  },
);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const STRATEGIES: Record<string, Strategy> = {
  [smaTrend.meta.id]: smaTrend,
  [rsiReversion.meta.id]: rsiReversion,
  [breakout.meta.id]: breakout,
  [mlSignal.meta.id]: mlSignal,
};

export const STRATEGY_LIST: Strategy[] = Object.values(STRATEGIES);

export function getStrategy(id: string): Strategy | undefined {
  return STRATEGIES[id];
}

// ---------------------------------------------------------------------------
// Live parameter management (used by the self-improvement engine)
// ---------------------------------------------------------------------------

export function getActiveParams(id: string): StrategyParams {
  return { ...(activeParams.get(id) ?? {}) };
}

/** Clamp a candidate param set to its strategy's declared bounds. */
export function clampParams(id: string, params: StrategyParams): StrategyParams {
  const strat = STRATEGIES[id];
  if (!strat) return params;
  const out: StrategyParams = {};
  for (const spec of strat.meta.params) {
    const raw = params[spec.key] ?? spec.default;
    out[spec.key] = Math.min(spec.max, Math.max(spec.min, raw));
  }
  return out;
}

/** Apply a new active param set (clamped) for a strategy. Returns the applied set. */
export function setActiveParams(
  id: string,
  params: StrategyParams,
): StrategyParams {
  const clamped = clampParams(id, params);
  activeParams.set(id, clamped);
  schedulePersist();
  return clamped;
}

export function resetParams(id: string): StrategyParams {
  const strat = STRATEGIES[id];
  if (!strat) return {};
  activeParams.set(id, { ...strat.defaultParams });
  schedulePersist();
  return { ...strat.defaultParams };
}

// Tuned parameters survive restarts (clamped through current bounds on load).
registerPersistence(
  "strategyParams",
  () => Object.fromEntries(activeParams),
  (data) => {
    const d = data as Record<string, StrategyParams>;
    for (const [id, params] of Object.entries(d ?? {})) {
      if (STRATEGIES[id]) activeParams.set(id, clampParams(id, params));
    }
  },
);

/**
 * A lightweight Strategy view pinned to fixed params — used by the optimizer
 * and backtester to evaluate candidate parameter sets without mutating the
 * live active params.
 */
export function strategyWithParams(
  strategy: Strategy,
  params: StrategyParams,
): Strategy {
  return {
    meta: strategy.meta,
    defaultParams: strategy.defaultParams,
    evaluate: (candles, hasPosition) =>
      strategy.evaluateWith(params, candles, hasPosition),
    evaluateWith: strategy.evaluateWith,
  };
}
