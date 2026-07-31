// Portfolio-level risk for multi-symbol trading.
//
// Per-position sizing (sizing.ts) answers "how big is THIS trade?". That is
// not enough once the engine can hold several things at once: five positions
// each individually within the 25% cap is 125% of equity, and if they are all
// crypto they are effectively one position with five sets of fees.
//
// So there are three portfolio limits on top of the per-trade cap:
//   1. a ceiling on how many positions can be open at once,
//   2. a ceiling on total exposure across all of them,
//   3. a ceiling on CORRELATED exposure, which is the one that actually
//      matters — holding BTC and ETH is close to holding double BTC, and
//      naive diversification counts it as two independent bets.

import type { Candle } from "@shared/schema";

export interface OpenExposure {
  symbol: string;
  /** Current market value of the position. */
  notional: number;
}

export interface PortfolioLimits {
  /** Max positions open simultaneously. */
  maxConcurrentPositions: number;
  /** Max summed position value, as a fraction of equity. */
  maxTotalExposurePct: number;
  /**
   * Max correlation-weighted exposure to anything resembling this candidate,
   * as a fraction of equity. Two perfectly correlated 20% positions count as
   * 40% against this limit; two uncorrelated ones count as 20%.
   */
  maxCorrelatedExposurePct: number;
}

export interface PortfolioDecision {
  allowed: boolean;
  /** Largest notional this candidate may take, given what is already held. */
  maxNotional: number;
  reason: string;
}

/** Pearson correlation of two aligned return series. 0 when undefined. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const xs = a.slice(a.length - n);
  const ys = b.slice(b.length - n);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return 0;
  const r = sxy / Math.sqrt(sxx * syy);
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
}

/** Simple per-bar returns from candles. */
export function returnsOf(candles: Candle[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    if (prev > 0) out.push(candles[i].close / prev - 1);
  }
  return out;
}

/**
 * Decide whether a new position may be opened, and how large it may be.
 *
 * `correlations` maps an already-held symbol to its correlation with the
 * candidate. Correlation is used as an ABSOLUTE value: a strongly negative
 * correlation is a genuine hedge, but this system is long/flat only, so two
 * inversely-correlated longs still both lose in the regime that hurts them.
 * Treating |r| as the risk weight is the conservative reading.
 */
export function vetPortfolioEntry(
  candidate: string,
  equity: number,
  open: OpenExposure[],
  correlations: Record<string, number>,
  limits: PortfolioLimits,
  requestedNotional: number,
): PortfolioDecision {
  if (equity <= 0) {
    return { allowed: false, maxNotional: 0, reason: "No equity" };
  }
  if (open.some((p) => p.symbol === candidate)) {
    return { allowed: false, maxNotional: 0, reason: "Already holding this symbol" };
  }
  if (open.length >= limits.maxConcurrentPositions) {
    return {
      allowed: false,
      maxNotional: 0,
      reason: `At position limit (${limits.maxConcurrentPositions} open)`,
    };
  }

  const totalNotional = open.reduce((s, p) => s + p.notional, 0);
  const totalRoom = limits.maxTotalExposurePct * equity - totalNotional;
  if (totalRoom <= 0) {
    return {
      allowed: false,
      maxNotional: 0,
      reason: `At total exposure limit (${(limits.maxTotalExposurePct * 100).toFixed(0)}% of equity)`,
    };
  }

  // Correlation-weighted exposure already carried against this candidate.
  const correlated = open.reduce(
    (s, p) => s + Math.abs(correlations[p.symbol] ?? 0) * p.notional,
    0,
  );
  const correlatedRoom = limits.maxCorrelatedExposurePct * equity - correlated;
  if (correlatedRoom <= 0) {
    return {
      allowed: false,
      maxNotional: 0,
      reason: `Too much correlated exposure already (${(
        (correlated / equity) * 100
      ).toFixed(0)}% of equity in similar positions)`,
    };
  }

  const maxNotional = Math.min(requestedNotional, totalRoom, correlatedRoom);
  if (maxNotional <= 0) {
    return { allowed: false, maxNotional: 0, reason: "No room left for a position" };
  }

  const trimmed = maxNotional < requestedNotional - 1e-9;
  return {
    allowed: true,
    maxNotional,
    reason: trimmed
      ? `Trimmed to ${((maxNotional / equity) * 100).toFixed(1)}% of equity by portfolio limits`
      : "Within portfolio limits",
  };
}
