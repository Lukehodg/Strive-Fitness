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

const CANDLE_COUNT = 200;
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

  private async tick(): Promise<void> {
    try {
      const config = storage.getConfig();
      this.applyConfigBroker(config);

      const candles = await this.feed.getCandles(config.symbol, CANDLE_COUNT);
      if (!candles.length) return;
      const price = candles[candles.length - 1].close;
      this.lastPrice = price;
      this.broker.mark(config.symbol, price);

      // Settle any limit order left resting by the previous tick against the
      // bar that has since elapsed. This must happen before new signals are
      // evaluated — and it is the only honest place to decide those fills,
      // since a bar that has already closed when the order was placed cannot
      // legitimately fill it (that would be lookahead).
      const latestBar = candles[candles.length - 1];
      for (const settled of (await this.broker.resolvePending?.(latestBar, price)) ?? []) {
        this.applyResolvedOrder(config, settled);
      }

      this.rolloverDayIfNeeded();
      this.rolloverMinuteIfNeeded();

      const account = await this.broker.getAccount(price);
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

      // Pick the strategy (AI auto-select or user's fixed choice).
      this.updateStrategy(config, candles);

      // US equities are shut nights, weekends and holidays. Firing orders
      // into a closed market just accumulates rejects (or queues surprise
      // fills at the next open), so stand down until it reopens. Crypto is
      // 24/7 and always reports open.
      const marketOpen = (await this.broker.isMarketOpen?.(config.symbol)) ?? true;
      if (!marketOpen) {
        if (!this.marketClosedLogged) {
          this.marketClosedLogged = true;
          storage.log("info", `${config.symbol} market is closed — standing down until it reopens`);
        }
        this.lastEvaluatedAt = Date.now();
        return;
      }
      if (this.marketClosedLogged) {
        this.marketClosedLogged = false;
        storage.log("info", `${config.symbol} market is open — resuming`);
      }

      const position = await this.broker.getPosition(config.symbol);
      const hasPosition = position !== null && position.qty > 0;

      // Enforce per-trade stop-loss / take-profit before strategy logic.
      if (hasPosition && position && (await this.checkProtectiveExit(config, position, price, candles))) {
        this.lastEvaluatedAt = Date.now();
        return;
      }

      const signal = this.activeStrategy.evaluate(candles, hasPosition);
      this.lastEvaluatedAt = Date.now();

      if (signal.action === "buy" && !hasPosition) {
        await this.handleBuy(config, account, price, signal.strength, signal.reason, candles);
      } else if (signal.action === "sell" && hasPosition && position) {
        await this.handleSell(config, position, price, signal.reason, candles, false);
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
    await this.handleSell(config, position, price, reason, candles, isStopLoss);
    return true;
  }

  private async handleBuy(
    config: BotConfig,
    account: { cash: number; equity: number },
    price: number,
    strength: number,
    reason: string,
    candles: Candle[],
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
        symbol: config.symbol,
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
  ): Promise<void> {
    const bar = candles[candles.length - 1];
    const order = await this.broker.submitOrder(
      {
        symbol: config.symbol,
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
