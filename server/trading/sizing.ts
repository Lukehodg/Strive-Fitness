// Position sizing: volatility targeting + fractional Kelly.
//
// The single "conviction" number a strategy emits (0..1) says nothing about
// how much risk the CURRENT market conditions actually warrant, or whether
// this strategy has a real track record of being right. Sizing every trade as
// a flat fraction of equity regardless of volatility is a well-known way to
// oversize into a blowup — realized risk should be roughly constant, not
// notional exposure. And sizing by "gut feel" conviction, when the strategy's
// own trade history says otherwise, leaves money on the table (or risk on
// the table) that basic statistics would have corrected for.
//
// Two adjustments, multiplied into the base size, both textbook and both
// bounded so they can only move you WITHIN your existing maxPositionPct
// ceiling — never beyond it:
//
//   - Volatility targeting: scale down in choppy/volatile conditions, scale
//     up (up to the ceiling) in calm ones, so realized risk per trade stays
//     roughly constant regardless of regime.
//   - Fractional Kelly: scale by the strategy's own recent win-rate/payoff
//     track record, discounted to a FRACTION of full Kelly (full Kelly is
//     famously aggressive and brutally sensitive to estimation error — using
//     half-Kelly or less is the standard practical compromise).

import type { Candle, Trade } from "@shared/schema";
import { stddev } from "./indicators";

const VOL_MULTIPLIER_MIN = 0.25;
const VOL_MULTIPLIER_MAX = 2.0;
const KELLY_MULTIPLIER_MIN = 0.1;
const KELLY_MULTIPLIER_MAX = 1.0;
/** Trades needed before Kelly overrides the neutral (1.0) multiplier. */
const KELLY_MIN_TRADES = 10;
/** Trailing window of trades used to estimate win-rate/payoff. */
const KELLY_LOOKBACK_TRADES = 30;

/**
 * Ratio of a target per-bar volatility to the market's actual recent
 * volatility, clamped to a sane band. >1 means "calmer than target, size up
 * toward the ceiling"; <1 means "choppier than target, size down".
 */
export function computeVolatilityMultiplier(
  candles: Candle[],
  targetVolPct: number,
  lookback = 20,
): number {
  if (candles.length < lookback + 1) return 1;
  const closes = candles.slice(-(lookback + 1)).map((c) => c.close);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const recentVol = stddev(rets, rets.length);
  if (!recentVol || recentVol <= 0 || targetVolPct <= 0) return 1;
  const ratio = targetVolPct / recentVol;
  return Math.min(VOL_MULTIPLIER_MAX, Math.max(VOL_MULTIPLIER_MIN, ratio));
}

/**
 * Fractional-Kelly multiplier from a strategy's own recent trade history.
 * Returns 1 (neutral — trust the base sizing) until there's enough evidence
 * to estimate win-rate and payoff ratio at all.
 */
export function computeKellyMultiplier(
  trades: Trade[],
  strategyId: string,
  fraction = 0.5,
): number {
  const relevant = trades
    .filter((t) => t.strategy === strategyId)
    .slice(-KELLY_LOOKBACK_TRADES);
  if (relevant.length < KELLY_MIN_TRADES) return 1;

  const wins = relevant.filter((t) => t.pnl > 0);
  const losses = relevant.filter((t) => t.pnl <= 0);
  if (wins.length === 0 || losses.length === 0) return 1; // can't estimate a payoff ratio

  const winRate = wins.length / relevant.length;
  const avgWin = wins.reduce((a, t) => a + t.returnPct, 0) / wins.length;
  const avgLoss = Math.abs(losses.reduce((a, t) => a + t.returnPct, 0) / losses.length);
  if (avgLoss === 0) return 1;

  const payoffRatio = avgWin / avgLoss;
  // Kelly fraction: f* = W - (1-W)/R
  const kelly = winRate - (1 - winRate) / payoffRatio;
  const fractional = kelly * fraction;
  return Math.min(KELLY_MULTIPLIER_MAX, Math.max(KELLY_MULTIPLIER_MIN, fractional));
}

export interface SizingInputs {
  equity: number;
  cash: number;
  price: number;
  /** Hard ceiling — never exceeded, whatever the multipliers say. */
  maxPositionPct: number;
  /** Strategy's own conviction, 0..1. */
  strength: number;
  /** From computeVolatilityMultiplier; 1 = no adjustment. */
  volMultiplier?: number;
  /** From computeKellyMultiplier; 1 = no adjustment. */
  kellyMultiplier?: number;
}

export interface SizingResult {
  qty: number;
  /** strength × volMultiplier × kellyMultiplier, clamped to [0,1]. */
  adjustedStrength: number;
}

/**
 * Compute an order quantity. adjustedStrength is clamped to [0,1] BEFORE
 * multiplying by maxPositionPct, so volatility/Kelly can only move sizing
 * within the user's stated risk ceiling — never past it.
 */
export function sizePosition(inputs: SizingInputs): SizingResult {
  const vol = inputs.volMultiplier ?? 1;
  const kelly = inputs.kellyMultiplier ?? 1;
  const adjustedStrength = Math.min(1, Math.max(0, inputs.strength * vol * kelly));
  const targetNotional = inputs.equity * inputs.maxPositionPct * adjustedStrength;
  const affordable = Math.min(targetNotional, inputs.cash * 0.98);
  const qty = inputs.price > 0 && affordable > 0 ? affordable / inputs.price : 0;
  return { qty, adjustedStrength };
}
