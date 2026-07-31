// The trading engine. This is the orchestrator that runs on an interval and,
// on each tick: pulls fresh market data, (optionally) re-selects the best
// strategy, gets a signal, runs it through the risk manager, places orders via
// the active broker, and records everything to storage.
//
// Safety posture:
//  - Defaults to paper mode; live mode requires explicit config AND Alpaca keys.
//  - A daily-loss kill-switch halts all new entries until manually resumed.
//  - Every risk block and order is written to the decision log for audit.

import type {
  BotConfig,
  BotStatus,
  Candle,
  MarketRegime,
  Order,
  Position,
  Trade,
} from "@shared/schema";
import { storage } from "../storage";
import { registerPersistence } from "../persistence";
import { sendAlert } from "../alerts";
import {
  PaperBroker,
  AlpacaBroker,
  readAlpacaCredentials,
  type Broker,
} from "./brokers";
import { createMarketFeed, type MarketFeed } from "./marketData";
import { getStrategy, STRATEGIES, type Strategy } from "./strategies";
import { selectStrategy } from "./aiSelector";
import { isDailyLossBreached, vetBuy, type RiskContext } from "./riskManager";
import { computeKellyMultiplier, computeVolatilityMultiplier } from "./sizing";
import { correlation, returnsOf, vetPortfolioEntry, type OpenExposure } from "./portfolio";

const CANDLE_COUNT = 200;
/**
 * Symbols fetched concurrently per tick. Alpaca's free data tier allows
 * ~200 requests/minute; 8 in flight keeps a large universe well inside that
 * while cutting tick time roughly 8x versus fetching one at a time.
 */
const FETCH_CONCURRENCY = 8;

/** Run `worker` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}
/**
 * Re-run AI strategy selection at most this often (ms).
 *
 * Measured over 8 independent simulated months: at the previous 5-minute
 * cadence with no switching margin the selector churned through ~1,156
 * strategy switches per month. Moving to 30 minutes plus the hysteresis
 * margin in aiSelector cuts that to ~145 and lowers median max drawdown
 * from 2.35% to 1.87%, with no cost to returns.
 *
 * Deliberately NOT tuned to the best-scoring cell of that sweep: the spread
 * across settings (10.35%-11.73% median) is within noise for 8 samples, and
 * picking the top cell would be exactly the overfitting the PBO/DSR gates in
 * ai/cscv.ts and ai/metrics.ts exist to prevent. These values were chosen for
 * low churn and low drawdown, which are the robust effects.
 */
const RESELECT_INTERVAL_MS = 30 * 60_000;

class TradingEngine {
  private feed: MarketFeed = createMarketFeed();
  private broker: Broker = new PaperBroker(10_000);
  private timer: NodeJS.Timeout | null = null;

  private running = false;
  private halted = false;
  private haltReason: string | undefined;

  private activeStrategy: Strategy = STRATEGIES.sma_trend;
  private regime: MarketRegime | "unknown" = "unknown";
  private lastSelectionAt = 0;

  private dayStartEquity = 10_000;
  private dayStamp = new Date().toDateString();
  private lastPrice: number | null = null;
  private lastEvaluatedAt: number | null = null;

  // Order-rate limiting: count orders within the current minute.
  private orderMinute = 0;
  private ordersThisMinute = 0;

  // Track our open entry so we can record a completed Trade on exit. The
  // broker holds authoritative position state; this mirrors entry metadata.
  private openEntry: { price: number; time: number; strategyId: string } | null =
    null;

  // Watchdog: detect a wedged loop (running but not ticking).
  private lastTickCompletedAt: number | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private stallAlerted = false;
  /** Avoids repeating the "market closed" line on every tick overnight. */
  private marketClosedLogged = false;

  constructor() {
    this.applyConfigBroker(storage.getConfig());
    // Paper balance, open position metadata, and kill-switch state survive
    // restarts so the simulated book doesn't reset to $10k on every boot.
    registerPersistence(
      "engine",
      () => ({
        paperBroker:
          this.broker instanceof PaperBroker ? this.broker.snapshot() : null,
        openEntry: this.openEntry,
        dayStartEquity: this.dayStartEquity,
        dayStamp: this.dayStamp,
        halted: this.halted,
        haltReason: this.haltReason ?? null,
      }),
      (data) => {
        const d = data as {
          paperBroker: { cash: number; positions: never[] } | null;
          openEntry: { price: number; time: number; strategyId: string } | null;
          dayStartEquity: number;
          dayStamp: string;
          halted: boolean;
          haltReason: string | null;
        };
        if (d.paperBroker && this.broker instanceof PaperBroker) {
          this.broker.restore(d.paperBroker);
        }
        if (d.openEntry !== undefined) this.openEntry = d.openEntry;
        if (typeof d.dayStartEquity === "number") this.dayStartEquity = d.dayStartEquity;
        if (typeof d.dayStamp === "string") this.dayStamp = d.dayStamp;
        if (typeof d.halted === "boolean") this.halted = d.halted;
        this.haltReason = d.haltReason ?? undefined;
      },
    );
  }

  // -- Broker wiring ------------------------------------------------------

  /** Choose the broker implementation based on mode + available credentials. */
  private applyConfigBroker(config: BotConfig): void {
    const creds = readAlpacaCredentials();
    if (config.mode === "live" && creds) {
      this.broker = new AlpacaBroker(creds);
    } else {
      // Keep the existing paper broker if we already have one running, so
      // switching config mid-session doesn't wipe simulated balance.
      if (!(this.broker instanceof PaperBroker)) {
        this.broker = new PaperBroker(10_000);
      }
    }
  }

  liveKeysConfigured(): boolean {
    return readAlpacaCredentials() !== null;
  }

  // -- Lifecycle ----------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTickCompletedAt = Date.now();
    this.stallAlerted = false;
    storage.log("resume", "Engine started");
    this.scheduleNext();
    this.startWatchdog();
    // Kick an immediate evaluation so the UI updates right away.
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    storage.log("info", "Engine stopped");
  }

  /** Alert if the engine claims to be running but hasn't completed a tick. */
  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (!this.running || this.lastTickCompletedAt === null) return;
      const config = storage.getConfig();
      const staleMs = Date.now() - this.lastTickCompletedAt;
      const limitMs = Math.max(3 * config.intervalSeconds * 1000, 120_000);
      if (staleMs > limitMs && !this.stallAlerted) {
        this.stallAlerted = true;
        sendAlert(
          "critical",
          "Engine stalled",
          `The engine is marked running but hasn't completed a tick in ${Math.round(
            staleMs / 1000,
          )}s (limit ${Math.round(limitMs / 1000)}s).`,
        );
      }
    }, 60_000);
    this.watchdog.unref();
  }

  /** Clear a tripped kill-switch and allow new entries again. */
  resume(): void {
    this.halted = false;
    this.haltReason = undefined;
    // Reset the daily baseline so the limit measures from here forward.
    this.dayStartEquity = storage.latestEquity()?.equity ?? this.dayStartEquity;
    storage.log("resume", "Kill-switch cleared; trading resumed");
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const config = storage.getConfig();
    const ms = Math.max(5, config.intervalSeconds) * 1000;
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNext());
    }, ms);
  }

  // -- Main loop ----------------------------------------------------------

  /** Every symbol the engine may trade this tick, primary first, deduped. */
  private universeOf(config: BotConfig): string[] {
    return Array.from(new Set([config.symbol, ...(config.extraSymbols ?? [])])).filter(Boolean);
  }

  private async tick(): Promise<void> {
    try {
      const config = storage.getConfig();
      this.applyConfigBroker(config);

      const universe = this.universeOf(config);

      // Pull each symbol's history, skipping any that is closed or has no
      // data. Doing this once up front means the portfolio decisions below
      // all see the same snapshot of the market.
      const candlesBySymbol: Record<string, Candle[]> = {};
      const barsBySymbol: Record<string, { high: number; low: number; close: number }> = {};
      const closedSymbols: string[] = [];
      // Fetched in parallel with a bounded worker pool. Sequentially, a
      // 50-symbol universe at ~200ms per round-trip would take ~10s per tick
      // and starve the loop; unbounded, it would burst straight through the
      // venue's rate limit. A failure on one symbol must never abort the tick,
      // so each worker isolates its own errors.
      await mapWithConcurrency(universe, FETCH_CONCURRENCY, async (symbol) => {
        try {
          const open = (await this.broker.isMarketOpen?.(symbol)) ?? true;
          if (!open) {
            closedSymbols.push(symbol);
            return;
          }
          const candles = await this.feed.getCandles(symbol, CANDLE_COUNT);
          if (!candles.length) return;
          candlesBySymbol[symbol] = candles;
          const bar = candles[candles.length - 1];
          barsBySymbol[symbol] = { high: bar.high, low: bar.low, close: bar.close };
          this.broker.mark(symbol, bar.close);
        } catch (err) {
          storage.log("info", `${symbol}: data unavailable (${(err as Error).message})`);
        }
      });

      if (closedSymbols.length && !this.marketClosedLogged) {
        this.marketClosedLogged = true;
        storage.log("info", `Market closed for ${closedSymbols.join(", ")} — standing down on those`);
      } else if (!closedSymbols.length && this.marketClosedLogged) {
        this.marketClosedLogged = false;
        storage.log("info", "All markets open — resuming");
      }

      const tradable = Object.keys(candlesBySymbol);
      if (!tradable.length) {
        this.lastEvaluatedAt = Date.now();
        return;
      }
      this.lastPrice = barsBySymbol[config.symbol]?.close ?? barsBySymbol[tradable[0]].close;

      // Settle limit orders left resting by the previous tick, each against
      // its OWN symbol's elapsed bar. This must happen before new signals are
      // evaluated, and is the only honest place to decide those fills: a bar
      // that had already closed when the order was placed cannot legitimately
      // fill it (that would be lookahead).
      for (const settled of (await this.broker.resolvePending?.(barsBySymbol)) ?? []) {
        this.applyResolvedOrder(config, settled);
      }

      this.rolloverDayIfNeeded();
      this.rolloverMinuteIfNeeded();

      const account = await this.broker.getAccount();
      storage.addEquityPoint({
        time: Date.now(),
        equity: account.equity,
        cash: account.cash,
      });
      if (this.dayStartEquity <= 0) this.dayStartEquity = account.equity;

      // Kill-switch: stop opening new risk if the daily loss limit is hit.
      if (
        !this.halted &&
        isDailyLossBreached({
          config,
          equity: account.equity,
          dayStartEquity: this.dayStartEquity,
        })
      ) {
        this.halted = true;
        this.haltReason = `Daily loss limit of ${(
          config.dailyLossLimitPct * 100
        ).toFixed(1)}% reached`;
        storage.log("halt", this.haltReason);
        sendAlert(
          "critical",
          "Kill-switch tripped",
          `${this.haltReason}. New entries are blocked until resume or the next trading day.`,
        );
      }

      // Strategy selection still runs on the primary symbol — it picks HOW to
      // trade, while the portfolio logic below picks WHAT.
      this.updateStrategy(config, candlesBySymbol[config.symbol] ?? candlesBySymbol[tradable[0]]);
      this.lastEvaluatedAt = Date.now();

      // 1. EXITS FIRST, always. Freeing capital and cutting losers takes
      //    priority over any new opportunity, and an exit is never blocked by
      //    the kill-switch.
      const openPositions: OpenExposure[] = [];
      for (const symbol of tradable) {
        const position = await this.broker.getPosition(symbol);
        if (!position || position.qty <= 0) continue;
        const candles = candlesBySymbol[symbol];
        const price = barsBySymbol[symbol].close;

        if (await this.checkProtectiveExit(config, position, price, candles, symbol)) continue;

        const signal = this.activeStrategy.evaluate(candles, true);
        if (signal.action === "sell") {
          await this.handleSell(config, position, price, signal.reason, candles, false, symbol);
          continue;
        }
        openPositions.push({ symbol, notional: position.qty * price });
      }

      if (this.halted) return;

      // 2. ENTRIES. Rank every candidate that is signalling, strongest
      //    conviction first, so limited capital goes to the best opportunity
      //    rather than whichever symbol happens to be first alphabetically.
      const candidates: Array<{ symbol: string; strength: number; reason: string }> = [];
      for (const symbol of tradable) {
        if (openPositions.some((p) => p.symbol === symbol)) continue;
        const signal = this.activeStrategy.evaluate(candlesBySymbol[symbol], false);
        if (signal.action === "buy") {
          candidates.push({ symbol, strength: signal.strength, reason: signal.reason });
        }
      }
      candidates.sort((a, b) => b.strength - a.strength);

      for (const candidate of candidates) {
        const price = barsBySymbol[candidate.symbol].close;
        const fresh = await this.broker.getAccount();

        // Correlation of this candidate against everything already held.
        const candidateReturns = returnsOf(candlesBySymbol[candidate.symbol]);
        const correlations: Record<string, number> = {};
        for (const held of openPositions) {
          const heldCandles = candlesBySymbol[held.symbol];
          correlations[held.symbol] = heldCandles
            ? correlation(candidateReturns, returnsOf(heldCandles))
            : 1; // unknown: assume fully correlated, the conservative reading
        }

        const requested = fresh.equity * config.maxPositionPct * candidate.strength;
        const verdict = vetPortfolioEntry(
          candidate.symbol,
          fresh.equity,
          openPositions,
          correlations,
          {
            maxConcurrentPositions: config.maxConcurrentPositions,
            maxTotalExposurePct: config.maxTotalExposurePct,
            maxCorrelatedExposurePct: config.maxCorrelatedExposurePct,
          },
          requested,
        );
        if (!verdict.allowed) {
          storage.log("risk_block", `${candidate.symbol}: ${verdict.reason}`, this.activeStrategy.meta.id);
          continue;
        }

        // Translate the portfolio ceiling back into a conviction the
        // per-trade sizing understands, so both limits apply and the tighter
        // one wins.
        const cappedStrength =
          fresh.equity * config.maxPositionPct > 0
            ? Math.min(candidate.strength, verdict.maxNotional / (fresh.equity * config.maxPositionPct))
            : 0;
        if (cappedStrength <= 0) continue;

        const before = await this.broker.getPosition(candidate.symbol);
        await this.handleBuy(
          config,
          fresh,
          price,
          cappedStrength,
          candidate.reason,
          candlesBySymbol[candidate.symbol],
          candidate.symbol,
        );
        const after = await this.broker.getPosition(candidate.symbol);
        const filledNow = after && (!before || after.qty > before.qty);
        // A resting limit order has not filled yet, but it has committed the
        // capital — count it against the limits so the next candidate in this
        // same tick cannot spend the same money twice.
        openPositions.push({
          symbol: candidate.symbol,
          notional: filledNow ? after!.qty * price : verdict.maxNotional,
        });
      }
    } catch (err) {
      storage.log("info", `Tick error: ${(err as Error).message}`);
    } finally {
      this.lastTickCompletedAt = Date.now();
      if (this.stallAlerted) {
        this.stallAlerted = false;
        sendAlert("info", "Engine recovered", "Ticks are completing again.");
      }
    }
  }

  private updateStrategy(config: BotConfig, candles: Candle[]): void {
    if (config.autoSelectStrategy) {
      const now = Date.now();
      if (now - this.lastSelectionAt >= RESELECT_INTERVAL_MS) {
        this.lastSelectionAt = now;
        const result = selectStrategy(candles, this.activeStrategy.meta.id);
        this.regime = result.regime;
        if (result.chosen.meta.id !== this.activeStrategy.meta.id) {
          storage.log(
            "strategy_switch",
            result.rationale,
            result.chosen.meta.id,
          );
        }
        this.activeStrategy = result.chosen;
      }
    } else {
      const chosen = getStrategy(config.activeStrategyId);
      if (chosen && chosen.meta.id !== this.activeStrategy.meta.id) {
        this.activeStrategy = chosen;
        storage.log(
          "strategy_switch",
          `Manually set active strategy to ${chosen.meta.name}`,
          chosen.meta.id,
        );
      }
    }
  }

  /** Returns true if a protective stop/target fired and we exited. */
  private async checkProtectiveExit(
    config: BotConfig,
    position: Position,
    price: number,
    candles: Candle[],
    symbol: string,
  ): Promise<boolean> {
    const change = (price - position.avgEntryPrice) / position.avgEntryPrice;
    let reason: string | null = null;
    let isStopLoss = false;
    if (change <= -config.stopLossPct) {
      reason = `Stop-loss: ${(change * 100).toFixed(2)}%`;
      isStopLoss = true;
    } else if (change >= config.takeProfitPct) {
      reason = `Take-profit: +${(change * 100).toFixed(2)}%`;
    }
    if (!reason) return false;
    // A stop-loss must never wait for a better price — always a guaranteed,
    // immediate fill. A take-profit can try for a better price first.
    await this.handleSell(config, position, price, reason, candles, isStopLoss, symbol);
    return true;
  }

  private async handleBuy(
    config: BotConfig,
    account: { cash: number; equity: number },
    price: number,
    strength: number,
    reason: string,
    candles: Candle[],
    symbol: string,
  ): Promise<void> {
    if (this.halted) {
      storage.log("risk_block", `Buy blocked — ${this.haltReason}`);
      return;
    }

    // Volatility targeting + fractional Kelly, when the user has opted in.
    // Both are bounded so they can only move sizing within maxPositionPct —
    // never past it (enforced inside sizePosition, not here).
    const volMultiplier = config.adaptiveSizing
      ? computeVolatilityMultiplier(candles, config.volTargetPct)
      : 1;
    const kellyMultiplier = config.adaptiveSizing
      ? computeKellyMultiplier(storage.allTrades(), this.activeStrategy.meta.id, config.kellyFraction)
      : 1;

    const ctx: RiskContext = {
      config,
      equity: account.equity,
      dayStartEquity: this.dayStartEquity,
      cash: account.cash,
      price,
      hasPosition: false,
      ordersThisMinute: this.ordersThisMinute,
      volMultiplier,
      kellyMultiplier,
    };
    const decision = vetBuy(ctx, strength);
    if (!decision.allowed) {
      storage.log("risk_block", `Buy blocked — ${decision.reason}`, this.activeStrategy.meta.id);
      return;
    }

    const bar = candles[candles.length - 1];
    const order = await this.broker.submitOrder(
      {
        symbol,
        side: "buy",
        qty: decision.qty,
        reason,
        limitOffsetPct: config.limitOrderOffsetPct,
        bar: { high: bar.high, low: bar.low },
      },
      price,
    );
    this.ordersThisMinute++;
    this.applyResolvedOrder(config, order, decision.reason);
  }

  /**
   * Record the outcome of an order. Called both for orders that settle
   * immediately (market/stop) and — a tick later, via `resolvePending` — for
   * limit orders that had to rest until a bar elapsed against them.
   */
  private applyResolvedOrder(config: BotConfig, order: Order, sizingNote?: string): void {
    if (order.status === "pending") {
      storage.log(
        "info",
        `${order.side === "buy" ? "Buy" : "Sell"} limit resting @ ${order.price.toFixed(2)}` +
          ` — settles next tick${sizingNote ? ` (${sizingNote})` : ""}`,
        this.activeStrategy.meta.id,
      );
      return;
    }

    if (order.side === "buy") {
      if (order.status !== "filled") {
        // A missed maker fill is normal (no urgency on entries) — only log it
        // as a decision, not a risk block, and don't alert on it.
        storage.log("info", `Buy not filled — ${order.message}`, this.activeStrategy.meta.id);
        return;
      }
      this.openEntry = {
        price: order.price,
        time: order.createdAt,
        strategyId: this.activeStrategy.meta.id,
      };
      storage.log(
        "order",
        `BUY ${order.qty.toFixed(6)} ${config.symbol} @ ${order.price.toFixed(2)}` +
          `${order.fillType ? ` (${order.fillType})` : ""} — ${order.reason ?? ""}` +
          `${sizingNote ? ` (${sizingNote})` : ""}`,
        this.activeStrategy.meta.id,
      );
      sendAlert(
        "info",
        `BUY ${config.symbol}`,
        `${order.qty.toFixed(6)} @ ${order.price.toFixed(2)} (${config.mode}) — ${order.reason ?? ""}`,
      );
      return;
    }

    if (order.status !== "filled") {
      storage.log("info", `Sell rejected — ${order.message}`);
      return;
    }
    this.recordSellFill(config, order);
  }

  /** Turn a filled exit into a completed Trade in the log. */
  private recordSellFill(config: BotConfig, order: Order): void {
    const entryPrice = this.openEntry?.price ?? order.price;
    const entryTime = this.openEntry?.time ?? order.createdAt;
    const strategyId = this.openEntry?.strategyId ?? this.activeStrategy.meta.id;
    const reason = order.reason ?? "";
    const pnl = (order.price - entryPrice) * order.qty;
    const trade: Trade = {
      id: order.id,
      symbol: config.symbol,
      strategy: strategyId,
      qty: order.qty,
      entryPrice,
      exitPrice: order.price,
      entryTime,
      exitTime: order.createdAt,
      pnl,
      returnPct: entryPrice > 0 ? (order.price - entryPrice) / entryPrice : 0,
      reason,
    };
    storage.addTrade(trade);
    this.openEntry = null;
    storage.log(
      "order",
      `SELL ${order.qty.toFixed(6)} ${config.symbol} @ ${order.price.toFixed(2)}` +
        `${order.fillType ? ` (${order.fillType})` : ""} — ${reason} | P&L ${
          pnl >= 0 ? "+" : ""
        }${pnl.toFixed(2)}`,
      strategyId,
    );
    sendAlert(
      "info",
      `SELL ${config.symbol}`,
      `${order.qty.toFixed(6)} @ ${order.price.toFixed(2)} (${config.mode}) — ${reason} | P&L ${
        pnl >= 0 ? "+" : ""
      }${pnl.toFixed(2)}`,
    );
  }

  private async handleSell(
    config: BotConfig,
    position: Position,
    price: number,
    reason: string,
    candles: Candle[],
    forceTaker: boolean,
    symbol: string,
  ): Promise<void> {
    const bar = candles[candles.length - 1];
    const order = await this.broker.submitOrder(
      {
        symbol,
        side: "sell",
        qty: position.qty,
        reason,
        limitOffsetPct: config.limitOrderOffsetPct,
        bar: { high: bar.high, low: bar.low },
        forceTaker,
      },
      price,
    );
    this.ordersThisMinute++;
    this.applyResolvedOrder(config, order);
  }

  // -- Housekeeping -------------------------------------------------------

  private rolloverDayIfNeeded(): void {
    const today = new Date().toDateString();
    if (today !== this.dayStamp) {
      this.dayStamp = today;
      this.dayStartEquity = storage.latestEquity()?.equity ?? this.dayStartEquity;
      // A new day clears a loss-limit halt automatically.
      if (this.halted) {
        this.halted = false;
        this.haltReason = undefined;
        storage.log("resume", "New trading day — kill-switch reset");
      }
    }
  }

  private rolloverMinuteIfNeeded(): void {
    const minute = Math.floor(Date.now() / 60_000);
    if (minute !== this.orderMinute) {
      this.orderMinute = minute;
      this.ordersThisMinute = 0;
    }
  }

  // -- Status readout -----------------------------------------------------

  getStatus(): BotStatus {
    const config = storage.getConfig();
    return {
      running: this.running,
      halted: this.halted,
      haltReason: this.haltReason,
      mode: config.mode,
      liveKeysConfigured: this.liveKeysConfigured(),
      symbol: config.symbol,
      activeStrategyId: this.activeStrategy.meta.id,
      activeStrategyName: this.activeStrategy.meta.name,
      regime: this.regime,
      lastEvaluatedAt: this.lastEvaluatedAt,
      lastPrice: this.lastPrice,
    };
  }

  async getPosition(): Promise<Position | null> {
    const config = storage.getConfig();
    return this.broker.getPosition(config.symbol);
  }

  get feedSource(): "alpaca" | "synthetic" {
    return this.feed.source;
  }
}

export const engine = new TradingEngine();
