// Backtester. Replays a strategy bar-by-bar over historical candles using the
// same evaluate() logic the live engine uses, then reports performance stats.
//
// Two sizing modes:
//   - Legacy (default, `sizing` omitted): flat ~95%-of-cash per trade, plain
//     fee+slippage cost. Unchanged from the original implementation — used
//     by the AI regime-selector's internal relative ranking, which only
//     needs to compare strategies against each other and has its own tuned
//     acceptance thresholds that this preserves exactly.
//   - Realistic (`sizing` provided): sizes exactly the way the live engine
//     sizes (maxPositionPct × conviction, optionally adjusted by volatility
//     targeting and fractional Kelly) and fills exactly the way the live
//     paper broker fills (maker-first limit orders when enabled). This is
//     what powers the user-facing Strategies tab and the optimizer's
//     accept/reject decisions — so those numbers describe what live trading
//     would actually do, not an unrelated flat-sizing fiction.
import type {
  BacktestResult,
  Candle,
  PerformanceStats,
  Trade,
} from "@shared/schema";
import { sharpe as sharpeOf } from "../ai/metrics";
import { attemptFill } from "./execution";
import { INDICATOR_LOOKBACK_WINDOW } from "./indicators";
import { computeKellyMultiplier, computeVolatilityMultiplier, sizePosition } from "./sizing";
import type { Strategy } from "./strategies";

interface OpenLot {
  entryPrice: number;
  entryTime: number;
  qty: number;
}

/** Legacy flat per-side cost (fee + slippage) — unchanged from the original. */
const LEGACY_COST_RATE = 0.001 + 0.0005;
/** Bars of warm-up before signals are taken (indicators need history). */
const WARMUP = 35;
const VOL_LOOKBACK = 20;

export interface BacktestSizing {
  /** Ceiling fraction of equity per position (never exceeded). */
  maxPositionPct: number;
  /** Apply volatility-targeting + fractional-Kelly multipliers. */
  adaptive: boolean;
  /** Per-bar target volatility used when `adaptive` is true. */
  volTargetPct: number;
  /** Kelly fraction (e.g. 0.5 = half-Kelly) used when `adaptive` is true. */
  kellyFraction: number;
  /** Maker-first limit order offset; 0 disables (pure market fills). */
  limitOrderOffsetPct: number;
  /**
   * Symbol being tested, so the right asset class's costs apply. Crypto pays a
   * real fee; Alpaca equities pay none and cost only the spread.
   */
  symbol?: string;
  /** Skip entries that cannot rest, rather than crossing the spread. */
  makerOnlyEntries?: boolean;
}

export function backtestStrategy(
  strategy: Strategy,
  candles: Candle[],
  startEquity = 10_000,
  stopLossPct = 0.03,
  takeProfitPct = 0.06,
  sizing?: BacktestSizing,
): BacktestResult {
  let cash = startEquity;
  let open: OpenLot | null = null;
  const trades: Trade[] = [];
  const equityCurve: number[] = [];

  for (let i = WARMUP; i < candles.length; i++) {
    // Bounded trailing window, not the full history from index 0 — every
    // indicator used by any strategy settles well within this many bars
    // (verified), and re-slicing/re-scanning full history on every single
    // bar would make this loop O(n²) instead of O(n).
    const window = candles.slice(Math.max(0, i + 1 - INDICATOR_LOOKBACK_WINDOW), i + 1);
    const bar = candles[i];
    const price = bar.close;
    // A limit order decided on `bar`'s close rests during the NEXT bar — that
    // is the only bar whose range may legitimately decide the fill. Using
    // `bar` itself would be lookahead (see attemptFill's docs).
    const restingBar = candles[i + 1] ?? null;

    // Check stop-loss / take-profit before the strategy's own exit logic.
    if (open) {
      const change = (price - open.entryPrice) / open.entryPrice;
      let forcedExit: string | null = null;
      let forceTaker = false;
      if (change <= -stopLossPct) {
        forcedExit = "Stop-loss hit";
        forceTaker = true; // never delay a stop for a better price
      } else if (change >= takeProfitPct) {
        forcedExit = "Take-profit hit";
      }
      if (forcedExit) {
        if (sizing) {
          const fill = attemptFill("sell", price, sizing.limitOrderOffsetPct, restingBar, forceTaker, true, sizing.symbol);
          cash += open.qty * fill.price * (1 - fill.feeRate);
          trades.push(closeTrade(strategy, open, bar, forcedExit, fill.price));
        } else {
          cash += open.qty * price * (1 - LEGACY_COST_RATE);
          trades.push(closeTrade(strategy, open, bar, forcedExit, price));
        }
        open = null;
      }
    }

    const signal = strategy.evaluate(window, open !== null, sizing?.symbol);

    if (!open && signal.action === "buy") {
      if (sizing) {
        const fill = attemptFill("buy", price, sizing.limitOrderOffsetPct, restingBar, false, false, sizing.symbol, sizing.makerOnlyEntries);
        if (fill.filled) {
          const vol = sizing.adaptive
            ? computeVolatilityMultiplier(window, sizing.volTargetPct, VOL_LOOKBACK)
            : 1;
          const kelly = sizing.adaptive
            ? computeKellyMultiplier(trades, strategy.meta.id, sizing.kellyFraction)
            : 1;
          const sized = sizePosition({
            equity: cash, // flat (no open position at this branch)
            cash,
            price: fill.price,
            maxPositionPct: sizing.maxPositionPct,
            strength: signal.strength,
            volMultiplier: vol,
            kellyMultiplier: kelly,
          });
          if (sized.qty > 0) {
            const notionalCost = sized.qty * fill.price * (1 + fill.feeRate);
            if (notionalCost <= cash + 1e-6) {
              cash -= notionalCost;
              open = { entryPrice: fill.price, entryTime: bar.time, qty: sized.qty };
            }
          }
        }
        // else: maker order didn't fill this bar — no urgency, try again next tick
      } else {
        const notional = cash * 0.95; // leave a little for fees
        const qty = notional / price;
        cash -= qty * price * (1 + LEGACY_COST_RATE);
        open = { entryPrice: price, entryTime: bar.time, qty };
      }
    } else if (open && signal.action === "sell") {
      if (sizing) {
        const fill = attemptFill("sell", price, sizing.limitOrderOffsetPct, restingBar, false, true, sizing.symbol);
        cash += open.qty * fill.price * (1 - fill.feeRate);
        trades.push(closeTrade(strategy, open, bar, signal.reason, fill.price));
      } else {
        cash += open.qty * price * (1 - LEGACY_COST_RATE);
        trades.push(closeTrade(strategy, open, bar, signal.reason, price));
      }
      open = null;
    }

    const markValue = open ? open.qty * price : 0;
    equityCurve.push(cash + markValue);
  }

  // Close any position at the last price so equity is fully realized.
  if (open) {
    const last = candles[candles.length - 1];
    if (sizing) {
      const fill = attemptFill("sell", last.close, sizing.limitOrderOffsetPct, last, true, true, sizing.symbol);
      cash += open.qty * fill.price * (1 - fill.feeRate);
      trades.push(closeTrade(strategy, open, last, "End of backtest", fill.price));
    } else {
      cash += open.qty * last.close * (1 - LEGACY_COST_RATE);
      trades.push(closeTrade(strategy, open, last, "End of backtest", last.close));
    }
    open = null;
  }

  const finalEquity = cash;
  const stats = computeStats(trades, equityCurve);

  // Per-bar equity returns — the series the statistical tests operate on.
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push(equityCurve[i] / equityCurve[i - 1] - 1);
  }

  return {
    strategyId: strategy.meta.id,
    strategyName: strategy.meta.name,
    stats,
    startEquity,
    finalEquity,
    returnPct: (finalEquity - startEquity) / startEquity,
    sharpe: sharpeOf(returns),
    returns,
  };
}

function closeTrade(
  strategy: Strategy,
  open: OpenLot,
  bar: Candle,
  reason: string,
  exitPrice: number,
): Trade {
  const pnl = (exitPrice - open.entryPrice) * open.qty;
  return {
    id: `${open.entryTime}-${bar.time}`,
    symbol: "",
    strategy: strategy.meta.id,
    qty: open.qty,
    entryPrice: open.entryPrice,
    exitPrice,
    entryTime: open.entryTime,
    exitTime: bar.time,
    pnl,
    returnPct: (exitPrice - open.entryPrice) / open.entryPrice,
    reason,
  };
}

export function computeStats(
  trades: Trade[],
  equityCurve: number[],
): PerformanceStats {
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const totalPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const avgReturn = trades.length
    ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length
    : 0;

  // Max drawdown over the equity curve.
  let peak = -Infinity;
  let maxDd = 0;
  for (const e of equityCurve) {
    if (e > peak) peak = e;
    if (peak > 0) {
      const dd = (peak - e) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }

  const curveReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    curveReturns.push(equityCurve[i] / equityCurve[i - 1] - 1);
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length ? wins / trades.length : 0,
    totalPnl,
    maxDrawdown: maxDd,
    avgReturn,
    sharpe: sharpeOf(curveReturns),
  };
}
