// Execution cost model, shared by the backtester and the paper broker so
// "what you backtest is what you'd actually pay" — the numbers the optimizer
// and the AI Lab trust are computed the same way the live engine fills.
//
// Two fill styles:
//  - Taker (market): fills immediately at the reference price, pays the full
//    fee and crosses the spread (slippage). Used for anything urgent — a
//    stop-loss must NEVER wait for a better price; that's the textbook way a
//    "smart" limit-order stop turns into an uncapped loss.
//  - Maker (limit): posts a resting order slightly through the reference
//    price. It only fills if the bar's range actually reaches it; in
//    exchange it pays a much lower fee and no added slippage. This is the
//    single most reliable, non-predictive way to raise net returns — cutting
//    the cost you pay on every single trade, win or lose.
//
// Real desks capture a large share of their edge this way. It's not
// "finding better signals" — it's simply not overpaying for execution.

import type { Candle } from "@shared/schema";

export const TAKER_FEE_RATE = 0.001; // 0.10% — typical retail taker fee
export const TAKER_SLIPPAGE_RATE = 0.0005; // 0.05% assumed adverse fill
export const MAKER_FEE_RATE = 0.0002; // 0.02% — typical maker fee/rebate tier
// Maker fills execute at their own posted price — no additional slippage.

export interface FillResult {
  filled: boolean;
  /** Executed price (0 when not filled). */
  price: number;
  feeRate: number;
  fillType: "maker" | "taker";
}

const NOT_FILLED: FillResult = { filled: false, price: 0, feeRate: 0, fillType: "maker" };

/** Price a resting limit order is posted at, `offsetPct` through the market. */
export function limitPriceFor(
  side: "buy" | "sell",
  referencePrice: number,
  offsetPct: number,
): number {
  return side === "buy"
    ? referencePrice * (1 - offsetPct)
    : referencePrice * (1 + offsetPct);
}

/**
 * Attempt a fill for one order.
 *
 * `restingBar` is the bar during which the limit order RESTS — i.e. the bar
 * AFTER the one whose close produced `referencePrice`. This distinction is
 * the whole ballgame: checking the limit against the *decision* bar's own
 * high/low is lookahead bias. That bar has already closed, so its range is
 * known; a limit priced off its close would then "fill" only at prices better
 * than that close, handing every trade a risk-free ~`offsetPct` improvement
 * on both entry and exit. Measured on drift-neutral data, that fabricated
 * ~0.12%/round-trip turned a losing strategy into a reliable +20%/month.
 *
 * Pass `null` when the resting bar isn't known yet (a live order that hasn't
 * had a bar elapse against it) — the caller must then treat the order as
 * pending rather than filled.
 *
 * - `offsetPct <= 0` or no `restingBar`: immediate taker/market fill.
 * - `forceTaker`: always an immediate taker fill regardless of offset — use
 *   this for stop-losses, which must never be delayed for a better price.
 * - Otherwise: posts a resting limit `offsetPct` through the reference price
 *   and fills only if the resting bar's range reaches it. Entries that don't
 *   fill are simply skipped (no urgency — the strategy re-evaluates next
 *   tick). Exits that don't fill fall back to an immediate taker fill,
 *   because an exit that never happens is a risk-management failure, not a
 *   cost optimization.
 *
 * This same function drives both the backtester and the live paper broker,
 * so backtest costs and live costs are computed identically.
 */
export function attemptFill(
  side: "buy" | "sell",
  referencePrice: number,
  offsetPct: number,
  restingBar: Pick<Candle, "high" | "low"> | null,
  forceTaker: boolean,
  isExit: boolean,
): FillResult {
  if (!forceTaker && offsetPct > 0 && restingBar) {
    const limitPrice = limitPriceFor(side, referencePrice, offsetPct);
    const touched =
      side === "buy" ? restingBar.low <= limitPrice : restingBar.high >= limitPrice;
    if (touched) {
      return { filled: true, price: limitPrice, feeRate: MAKER_FEE_RATE, fillType: "maker" };
    }
    if (!isExit) return NOT_FILLED; // entry: no urgency, just skip this tick
    // exit: fall through to a guaranteed taker fill below
  }
  const slip = side === "buy" ? 1 + TAKER_SLIPPAGE_RATE : 1 - TAKER_SLIPPAGE_RATE;
  return {
    filled: true,
    price: referencePrice * slip,
    feeRate: TAKER_FEE_RATE,
    fillType: "taker",
  };
}
