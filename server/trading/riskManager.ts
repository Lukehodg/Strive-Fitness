// Risk manager. Every intended order passes through here before it reaches a
// broker. These checks are hard limits — they exist so that no strategy, bug,
// or AI decision can blow up the account. They apply identically in paper and
// live mode.

import type { BotConfig } from "@shared/schema";

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
}

export interface RiskDecision {
  allowed: boolean;
  /** Approved quantity (base units) when allowed. */
  qty: number;
  reason: string;
}

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
  if (ctx.ordersThisMinute >= MAX_ORDERS_PER_MINUTE) {
    return { allowed: false, qty: 0, reason: "Order rate limit reached" };
  }
  if (isDailyLossBreached(ctx)) {
    return { allowed: false, qty: 0, reason: "Daily loss limit reached" };
  }
  if (ctx.hasPosition) {
    return { allowed: false, qty: 0, reason: "Already in a position" };
  }

  // Position size scales with conviction, capped by maxPositionPct of equity.
  const cappedStrength = Math.max(0, Math.min(1, strength));
  const targetNotional =
    ctx.equity * ctx.config.maxPositionPct * cappedStrength;
  const affordable = Math.min(targetNotional, ctx.cash * 0.98);
  if (affordable < 1 || ctx.price <= 0) {
    return { allowed: false, qty: 0, reason: "Position too small to open" };
  }
  const qty = affordable / ctx.price;
  return {
    allowed: true,
    qty,
    reason: `Sized to ${(ctx.config.maxPositionPct * cappedStrength * 100).toFixed(
      1,
    )}% of equity`,
  };
}

export const RISK_LIMITS = { MAX_ORDERS_PER_MINUTE };
