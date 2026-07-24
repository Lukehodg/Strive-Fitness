// Backtester. Replays a strategy bar-by-bar over historical candles using the
// same evaluate() logic the live engine uses, then reports performance stats.
// The AI selector uses these results to rank strategies on recent data.

import type {
  BacktestResult,
  Candle,
  PerformanceStats,
  Trade,
} from "@shared/schema";
import { sharpe as sharpeOf } from "../ai/metrics";
import type { Strategy } from "./strategies";

interface OpenLot {
  entryPrice: number;
  entryTime: number;
  qty: number;
}

const FEE_RATE = 0.001;
/** Adverse fill assumption per side — you rarely get the printed price. */
const SLIPPAGE_RATE = 0.0005;
/** Total per-side transaction cost applied to every fill. */
const COST_RATE = FEE_RATE + SLIPPAGE_RATE;
/** Bars of warm-up before signals are taken (indicators need history). */
const WARMUP = 35;

export function backtestStrategy(
  strategy: Strategy,
  candles: Candle[],
  startEquity = 10_000,
  stopLossPct = 0.03,
  takeProfitPct = 0.06,
): BacktestResult {
  let cash = startEquity;
  let open: OpenLot | null = null;
  const trades: Trade[] = [];
  const equityCurve: number[] = [];

  for (let i = WARMUP; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const bar = candles[i];
    const price = bar.close;

    // Check stop-loss / take-profit before the strategy's own exit logic.
    if (open) {
      const change = (price - open.entryPrice) / open.entryPrice;
      let forcedExit: string | null = null;
      if (change <= -stopLossPct) forcedExit = "Stop-loss hit";
      else if (change >= takeProfitPct) forcedExit = "Take-profit hit";
      if (forcedExit) {
        cash += open.qty * price * (1 - COST_RATE);
        trades.push(closeTrade(strategy, open, bar, forcedExit));
        open = null;
      }
    }

    const signal = strategy.evaluate(window, open !== null);

    if (!open && signal.action === "buy") {
      const notional = cash * 0.95; // leave a little for fees
      const qty = notional / price;
      cash -= qty * price * (1 + COST_RATE);
      open = { entryPrice: price, entryTime: bar.time, qty };
    } else if (open && signal.action === "sell") {
      cash += open.qty * price * (1 - COST_RATE);
      trades.push(closeTrade(strategy, open, bar, signal.reason));
      open = null;
    }

    const markValue = open ? open.qty * price : 0;
    equityCurve.push(cash + markValue);
  }

  // Close any position at the last price so equity is fully realized.
  if (open) {
    const last = candles[candles.length - 1];
    cash += open.qty * last.close * (1 - COST_RATE);
    trades.push(closeTrade(strategy, open, last, "End of backtest"));
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
): Trade {
  const pnl = (bar.close - open.entryPrice) * open.qty;
  return {
    id: `${open.entryTime}-${bar.time}`,
    symbol: "",
    strategy: strategy.meta.id,
    qty: open.qty,
    entryPrice: open.entryPrice,
    exitPrice: bar.close,
    entryTime: open.entryTime,
    exitTime: bar.time,
    pnl,
    returnPct: (bar.close - open.entryPrice) / open.entryPrice,
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
