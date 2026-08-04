// Risk manager. Every intended order passes through here before it reaches a
// broker. These checks are hard limits — they exist so that no strategy, bug,
// or AI decision can blow up the account. They apply identically in paper and
// live mode.

import type { BotConfig } from "@shared/schema";
import { sizePosition } from "./sizing";

export interface RiskContext {
  config: BotConfig;
  equity: number;
  /** Account equity at the start of the current trading day. */
  dayStartEquity: number;
  cash: number;
  price: number;
  hasPosition: boolean;
  /** Orders already submitted in the current minute (rate limiting). */
  ordersThisMinute: number;
  /** Volatility-targeting multiplier (1 = no adjustment). See sizing.ts. */
  volMultiplier?: number;
  /** Fractional-Kelly multiplier from the strategy's own track record (1 = no adjustment). */
  kellyMultiplier?: number;
  /** Portfolio-level ceiling on this position's value. See sizing.ts. */
  maxNotional?: number;
}

export interface RiskDecision {
  allowed: boolean;
  /** Approved quantity (base units) when allowed. */
  qty: number;
  reason: string;
}

/** Fallback ceiling when config does not specify one. */
const MAX_ORDERS_PER_MINUTE = 3;

/** Check whether the daily loss limit has been breached (kill-switch). */
export function isDailyLossBreached(ctx: {
  config: BotConfig;
  equity: number;
  dayStartEquity: number;
}): boolean {
  if (ctx.dayStartEquity <= 0) return false;
  const drop = (ctx.dayStartEquity - ctx.equity) / ctx.dayStartEquity;
  return drop >= ctx.config.dailyLossLimitPct;
}

/**
 * Vet a buy order and size it. Sell/exit orders are always allowed (reducing
 * risk), so this is only called for entries.
 */
export function vetBuy(ctx: RiskContext, strength: number): RiskDecision {
  const orderCeiling = ctx.config.maxOrdersPerMinute ?? MAX_ORDERS_PER_MINUTE;
  if (ctx.ordersThisMinute >= orderCeiling) {
    return { allowed: false, qty: 0, reason: "Order rate limit reached" };
  }
  if (isDailyLossBreached(ctx)) {
    return { allowed: false, qty: 0, reason: "Daily loss limit reached" };
  }
  if (ctx.hasPosition) {
    return { allowed: false, qty: 0, reason: "Already in a position" };
  }

  // Position size scales with conviction (and, when supplied, volatility
  // targeting + fractional Kelly), capped by maxPositionPct of equity — that
  // cap is a hard ceiling the multipliers can move within but never exceed.
  const sized = sizePosition({
    equity: ctx.equity,
    cash: ctx.cash,
    price: ctx.price,
    maxPositionPct: ctx.config.maxPositionPct,
    strength,
    volMultiplier: ctx.volMultiplier,
    kellyMultiplier: ctx.kellyMultiplier,
    maxNotional: ctx.maxNotional,
  });
  if (sized.qty <= 0 || ctx.price <= 0) {
    return { allowed: false, qty: 0, reason: "Position too small to open" };
  }

  const parts = [`${(ctx.config.maxPositionPct * sized.adjustedStrength * 100).toFixed(1)}% of equity`];
  if (ctx.volMultiplier !== undefined && Math.abs(ctx.volMultiplier - 1) > 0.01) {
    parts.push(`vol×${ctx.volMultiplier.toFixed(2)}`);
  }
  if (ctx.kellyMultiplier !== undefined && Math.abs(ctx.kellyMultiplier - 1) > 0.01) {
    parts.push(`kelly×${ctx.kellyMultiplier.toFixed(2)}`);
  }
  return {
    allowed: true,
    qty: sized.qty,
    reason: `Sized to ${parts.join(", ")}`,
  };
}

export const RISK_LIMITS = { MAX_ORDERS_PER_MINUTE };
