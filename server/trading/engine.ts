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
import { selectStrategy, detectRegime } from "./aiSelector";
import { isDailyLossBreached, vetBuy, type RiskContext } from "./riskManager";
import { computeKellyMultiplier, computeVolatilityMultiplier } from "./sizing";
import { positionSymbol } from "./assets";
import { correlation, returnsOf, vetPortfolioEntry, type OpenExposure } from "./portfolio";
import {
  volatilityOf, volTargetMultiplier, correlationLookup, type RiskLeg,
} from "./portfolioVol";
import { assessConfidence, type ConfidenceResult } from "./confidence";
import { checkBlackout, nextBroadEvent } from "./events";
import { setCostOverrides } from "./costs";

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
  /**
   * Entry metadata per OPEN SYMBOL, used to build the completed Trade on exit.
   *
   * This was a single nullable object, which was correct only while one
   * position could exist. Once the engine could hold several at once, opening
   * a second position overwrote the first's entry, and the first exit nulled
   * the record entirely — so remaining exits fell back to the exit price and
   * booked pnl = 0. Wrong P&L then fed straight back into position sizing,
   * because the Kelly multiplier reads the trade history.
   */
  private openEntries = new Map<
    string,
    { price: number; time: number; strategyId: string }
  >();

  // Watchdog: detect a wedged loop (running but not ticking).
  private lastTickCompletedAt: number | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private stallAlerted = false;
  /** Avoids repeating the "market closed" line on every tick overnight. */
  private marketClosedLogged = false;
  /** Symbols already warned about as held-but-unpriced, so it logs once. */
  private unwatchedLogged = new Set<string>();
  /** Last risk_block reason logged per symbol, to stop per-tick repetition. */
  private lastRiskBlock = new Map<string, string>();
  /** Avoids repeating the broker-unreachable line on every tick. */
  private brokerUnreachableLogged = false;
  /** Highest equity seen, for the drawdown term of the confidence score. */
  private peakEquity = 0;
  /** Latest confidence reading, surfaced via /api/confidence. */
  private confidence: ConfidenceResult | null = null;
  /** Last confidence band logged, so it reports changes not every tick. */
  private lastConfidenceBand = -1;

  constructor() {
    this.applyConfigBroker(storage.getConfig());
    // Paper balance, open position metadata, and kill-switch state survive
    // restarts so the simulated book doesn't reset to $10k on every boot.
    registerPersistence(
      "engine",
      () => ({
        paperBroker:
          this.broker instanceof PaperBroker ? this.broker.snapshot() : null,
        openEntries: Array.from(this.openEntries.entries()),
        // Without this the confidence governor forgets the drawdown on every
        // restart: peak resets to current equity, so "8% below peak" reads as
        // "0.0% below peak" and full size is restored at the worst moment.
        peakEquity: this.peakEquity,
        dayStartEquity: this.dayStartEquity,
        dayStamp: this.dayStamp,
        halted: this.halted,
        haltReason: this.haltReason ?? null,
      }),
      (data) => {
        const d = data as {
          paperBroker: { cash: number; positions: never[] } | null;
          openEntries?: Array<[string, { price: number; time: number; strategyId: string }]>;
          openEntry?: { price: number; time: number; strategyId: string } | null;
          peakEquity?: number;
          dayStartEquity: number;
          dayStamp: string;
          halted: boolean;
          haltReason: string | null;
        };
        if (d.paperBroker && this.broker instanceof PaperBroker) {
          this.broker.restore(d.paperBroker);
        }
        if (Array.isArray(d.openEntries)) {
          this.openEntries = new Map(d.openEntries);
        } else if (d.openEntry) {
          // Restoring state written before multi-symbol: attribute the single
          // entry to the configured primary symbol rather than dropping it.
          this.openEntries = new Map([[storage.getConfig().symbol, d.openEntry]]);
        }
        if (typeof d.peakEquity === "number") this.peakEquity = d.peakEquity;
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

  /**
   * Map a broker-format symbol back to the app's canonical spelling.
   *
   * Venues quote crypto positions without the slash ("MKRUSD"), but everything
   * else here keys on "MKR/USD". Left unconverted, the same position is
   * discovered under both spellings and counted TWICE against the exposure
   * limits — and assetClassOf("MKRUSD") reports "stock", applying equity
   * rules (market hours, whole-share rounding) to a crypto position.
   */
  private canonicalize(brokerSymbol: string, universe: string[]): string {
    if (universe.includes(brokerSymbol)) return brokerSymbol;
    const match = universe.find((u) => positionSymbol(u) === brokerSymbol);
    return match ?? brokerSymbol;
  }

  /**
   * Why this position must be closed now under day-trading rules, or null.
   *
   * Two separate deadlines, because the instruments differ: equities have a
   * session to be flat before, while crypto never closes and so is bounded by
   * holding time instead. Applying only the session rule would leave crypto
   * held indefinitely; applying only the time cap would let a late equity
   * entry straddle the bell.
   */
  private async dayTradingExitReason(
    config: BotConfig,
    symbol: string,
  ): Promise<string | null> {
    if (!config.dayTradingMode) return null;

    const closeAt = await this.broker.sessionCloseAt?.(symbol);
    if (closeAt) {
      const minutesLeft = (closeAt - Date.now()) / 60_000;
      if (minutesLeft <= config.flatBeforeCloseMinutes) {
        return `Day-trading flatten: ${minutesLeft.toFixed(0)}m to the close`;
      }
    }

    const entry = this.openEntries.get(symbol);
    if (entry) {
      const heldMinutes = (Date.now() - entry.time) / 60_000;
      if (heldMinutes >= config.maxHoldingMinutes) {
        return `Max holding time reached (${heldMinutes.toFixed(0)}m)`;
      }
    }
    return null;
  }

  /** True when it is too close to the bell to justify opening anything. */
  private async tooLateToEnter(config: BotConfig, symbol: string): Promise<boolean> {
    if (!config.dayTradingMode) return false;
    const closeAt = await this.broker.sessionCloseAt?.(symbol);
    if (!closeAt) return false;
    return (closeAt - Date.now()) / 60_000 <= config.noEntriesBeforeCloseMinutes;
  }

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
        await this.applyResolvedOrder(config, settled);
      }

      this.rolloverDayIfNeeded();
      this.rolloverMinuteIfNeeded();

      const account = await this.broker.getAccount();
      if (!account) {
        // Broker unreachable. Standing down is right, but it must NOT look
        // like a loss: treating unknown equity as zero trips the kill-switch
        // and would size positions against nothing.
        if (!this.brokerUnreachableLogged) {
          this.brokerUnreachableLogged = true;
          storage.log("risk_block", "Broker unreachable — no new orders until it responds");
        }
        this.lastEvaluatedAt = Date.now();
        return;
      }
      if (this.brokerUnreachableLogged) {
        this.brokerUnreachableLogged = false;
        storage.log("info", "Broker reachable again — resuming");
      }
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

      // Cost rates are user-overridable, so push them into the cost model
      // before anything prices a fill. Cheap, and skipping it would leave the
      // paper broker charging defaults while backtests used the overrides.
      setCostOverrides(config);

      // Score conditions before deciding anything. This reads only realised
      // results — it cannot be talked into optimism by a strong-looking signal.
      this.peakEquity = Math.max(this.peakEquity, account.equity);
      this.confidence = assessConfidence({
        trades: storage.allTrades(),
        equity: account.equity,
        dayStartEquity: this.dayStartEquity,
        peakEquity: this.peakEquity,
        regimeFit: this.activeStrategy.meta.bestRegimes.includes(this.regime as MarketRegime),
        mlEdge: null,
        minutesToBroadEvent: config.eventBlackout
          ? (() => {
              const e = nextBroadEvent(Date.now(), 120);
              return e ? (e.at - Date.now()) / 60_000 : null;
            })()
          : null,
      });
      if (config.confidenceGovernor) {
        // Log on band changes only; per-tick would drown the decision log.
        const band = Math.round(this.confidence.score * 5);
        if (band !== this.lastConfidenceBand) {
          this.lastConfidenceBand = band;
          storage.log("info", this.confidence.summary);
        }
      }

      // Strategy selection still runs on the primary symbol — it picks HOW to
      // trade, while the portfolio logic below picks WHAT.
      this.updateStrategy(config, candlesBySymbol[config.symbol] ?? candlesBySymbol[tradable[0]]);
      this.lastEvaluatedAt = Date.now();

      // 1. EXITS FIRST, always. Freeing capital and cutting losers takes
      //    priority over any new opportunity, and an exit is never blocked by
      //    the kill-switch.
      //    Position discovery walks the WHOLE universe, not just the symbols
      //    that returned data this tick. A position whose feed failed still
      //    consumes capital and still carries risk; leaving it out of
      //    openPositions would hide it from the exposure and concurrency
      //    limits and let the engine open more on top of it.
      // Ask the BROKER what we own, falling back to the universe only when it
      // cannot say. Anything held but no longer in the universe still needs
      // managing — see listPositions().
      const held = (await this.broker.listPositions?.()) ?? [];
      const discovery = held.length
        ? Array.from(new Set([...held.map((p) => this.canonicalize(p.symbol, universe)), ...universe]))
        : universe;

      const openPositions: OpenExposure[] = [];
      /**
       * Symbols closed during THIS tick.
       *
       * The exit paths below `continue` without pushing to openPositions —
       * correctly, since the position is gone — but the entries loop uses
       * openPositions as its "already holding" guard. So a symbol whose stop
       * just fired was invisible to that guard and could be re-bought on the
       * very same bar that stopped it out, at the same price, paying a round
       * trip to re-establish the position the stop had just closed. Measured
       * with rsi_reversion active: 73% of stop-loss bars also emitted a fresh
       * BUY on that bar.
       */
      const exitedThisTick = new Set<string>();
      for (const symbol of discovery) {
        const position = await this.broker.getPosition(symbol);
        if (!position || position.qty <= 0) continue;

        const candles = candlesBySymbol[symbol];
        const bar = barsBySymbol[symbol];
        if (!candles || !bar) {
          // No fresh price: count the exposure at its last known mark so the
          // limits stay honest, but say plainly that it could not be
          // risk-checked — a position nobody is watching is worth a warning.
          const stale = position.markPrice > 0 ? position.markPrice : position.avgEntryPrice;
          openPositions.push({ symbol, notional: position.qty * stale });
          if (!this.unwatchedLogged.has(symbol)) {
            this.unwatchedLogged.add(symbol);
            storage.log(
              "risk_block",
              `Holding ${symbol} but no price this tick — stop-loss and take-profit ` +
                `cannot be evaluated until data returns`,
            );
          }
          continue;
        }
        this.unwatchedLogged.delete(symbol);
        const price = bar.close;

        // Day trading: be flat before the bell, and never hold longer than the
        // configured cap. Both are FORCED taker exits — a maker order that
        // waits for a better price defeats the point of a deadline.
        const forced = await this.dayTradingExitReason(config, symbol);
        if (forced) {
          await this.handleSell(config, position, price, forced, candles, true, symbol);
          exitedThisTick.add(symbol);
          continue;
        }

        if (await this.checkProtectiveExit(config, position, price, candles, symbol)) {
          exitedThisTick.add(symbol);
          continue;
        }

        const signal = this.activeStrategy.evaluate(candles, true);
        if (signal.action === "sell") {
          await this.handleSell(config, position, price, signal.reason, candles, false, symbol);
          exitedThisTick.add(symbol);
          continue;
        }
        openPositions.push({ symbol, notional: position.qty * price });
      }

      if (this.halted) return;

      // 2. ENTRIES. Rank every candidate that is signalling, strongest
      //    conviction first, so limited capital goes to the best opportunity
      //    rather than whichever symbol happens to be first alphabetically.
      // Confidence below the floor: let open positions run their course, but
      // stop adding new risk until the evidence improves.
      if (config.confidenceGovernor && this.confidence && !this.confidence.allowEntries) {
        return;
      }

      const candidates: Array<{ symbol: string; strength: number; reason: string }> = [];
      for (const symbol of tradable) {
        if (openPositions.some((p) => p.symbol === symbol)) continue;
        // Just exited this tick. Re-entering on the bar that stopped us out
        // is not a new decision, it is the same one paid for twice.
        if (exitedThisTick.has(symbol)) {
          this.noteBlock(symbol, "Exited this bar — no immediate re-entry");
          continue;
        }
        // Opening near the bell just books a round trip's costs for a position
        // the flatten rule will close minutes later.
        if (await this.tooLateToEnter(config, symbol)) continue;
        // Scheduled release imminent. Entries only — anything already open is
        // left alone, because closing into the same thin pre-release book is
        // not obviously safer than holding with the stop already at the venue.
        if (config.eventBlackout) {
          const verdict = checkBlackout(symbol, Date.now(), {
            beforeMinutes: config.eventBlackoutBeforeMinutes,
            afterMinutes: config.eventBlackoutAfterMinutes,
          });
          if (verdict.blocked) {
            this.noteBlock(symbol, verdict.reason);
            continue;
          }
        }
        const signal = this.activeStrategy.evaluate(candlesBySymbol[symbol], false);
        if (signal.action === "buy") {
          candidates.push({ symbol, strength: signal.strength, reason: signal.reason });
        }
      }
      candidates.sort((a, b) => b.strength - a.strength);

      for (const candidate of candidates) {
        const price = barsBySymbol[candidate.symbol].close;
        const fresh = await this.broker.getAccount();
        // Broker went away mid-tick: stop opening risk rather than sizing
        // against an unknown balance.
        if (!fresh) break;

        // Correlation of this candidate against everything already held.
        const candidateReturns = returnsOf(candlesBySymbol[candidate.symbol]);
        const correlations: Record<string, number> = {};
        for (const held of openPositions) {
          const heldCandles = candlesBySymbol[held.symbol];
          correlations[held.symbol] = heldCandles
            ? correlation(candidateReturns, returnsOf(heldCandles))
            : 1; // unknown: assume fully correlated, the conservative reading
        }

        // The governor only ever scales DOWN from maxPositionPct.
        const govern =
          config.confidenceGovernor && this.confidence ? this.confidence.sizeMultiplier : 1;
        let requested = fresh.equity * config.maxPositionPct * candidate.strength * govern;

        // Portfolio-level volatility budget. Per-symbol sizing gives each
        // position the intended risk; only this looks at what they add up to
        // once correlation is accounted for. Also one-directional — it can
        // shrink a candidate, never enlarge one.
        if (config.portfolioVolTarget && fresh.equity > 0) {
          const held: RiskLeg[] = openPositions.map((p) => ({
            symbol: p.symbol,
            weight: p.notional / fresh.equity,
            vol: candlesBySymbol[p.symbol]
              ? volatilityOf(returnsOf(candlesBySymbol[p.symbol]))
              : 0,
          }));
          const volResult = volTargetMultiplier(
            held,
            {
              symbol: candidate.symbol,
              weight: requested / fresh.equity,
              vol: volatilityOf(candidateReturns),
            },
            config.portfolioVolTargetPct,
            correlationLookup(candidate.symbol, correlations),
          );
          if (volResult.multiplier <= 0) {
            this.noteBlock(candidate.symbol, volResult.reason);
            continue;
          }
          if (volResult.multiplier < 1) {
            this.noteBlock(candidate.symbol, volResult.reason);
          }
          requested *= volResult.multiplier;
        }
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
          this.noteBlock(candidate.symbol, verdict.reason);
          continue;
        }
        this.lastRiskBlock.delete(candidate.symbol);

        // Pass the portfolio ceiling through as a NOTIONAL cap rather than
        // folding it into conviction. Dividing it back into a strength (the
        // previous approach) let volatility targeting and Kelly multiply it
        // straight back out: a candidate trimmed to $1,000 was ordered at
        // $2,500. The cap now applies after those multipliers, in
        // sizePosition, so the tighter limit genuinely wins.
        const convictionNow = candidate.strength * govern;
        if (convictionNow <= 0 || verdict.maxNotional <= 0) continue;

        const before = await this.broker.getPosition(candidate.symbol);
        const placed = await this.handleBuy(
          config,
          fresh,
          price,
          convictionNow,
          candidate.reason,
          candlesBySymbol[candidate.symbol],
          candidate.symbol,
          verdict.maxNotional,
        );
        // Nothing was submitted (halted, rate-limited, rejected): no capital
        // was committed, so none may be booked against the limits.
        if (!placed || placed.status === "rejected") continue;

        const after = await this.broker.getPosition(candidate.symbol);
        const filledNow = after && (!before || after.qty > before.qty);
        // A resting limit order has not filled yet, but it HAS committed the
        // capital — count it so the next candidate in this same tick cannot
        // spend the same money twice. Size it from the order actually placed
        // rather than the ceiling it was allowed.
        openPositions.push({
          symbol: candidate.symbol,
          notional: filledNow
            ? after!.qty * price
            : Math.min(placed.qty * placed.price, verdict.maxNotional),
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
    // Classify the regime EVERY tick, whichever branch runs below.
    //
    // It used to be set only inside the auto-select branch, so pinning a
    // strategy left this.regime at "unknown" forever — which is not a real
    // regime, so the confidence governor's regime-fit factor scored a
    // permanent 0.6 and the dashboard reported "unknown" indefinitely. The
    // regime is a property of the MARKET, not of how the strategy was chosen.
    this.regime = detectRegime(candles);

    if (config.autoSelectStrategy) {
      const now = Date.now();
      if (now - this.lastSelectionAt >= RESELECT_INTERVAL_MS) {
        this.lastSelectionAt = now;
        const result = selectStrategy(candles, this.activeStrategy.meta.id);
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
    /** Portfolio-level ceiling on this position's value. */
    maxNotional?: number,
    // Returns the order actually placed, or null when nothing was submitted.
    // The caller needs that: it books the candidate's notional against the
    // portfolio limits for the rest of the tick, and doing so for an order the
    // risk manager REJECTED spends budget that was never committed. Three
    // rate-limited candidates could otherwise fill the ledger and block a
    // legitimate fourth.
  ): Promise<Order | null> {
    if (this.halted) {
      storage.log("risk_block", `Buy blocked — ${this.haltReason}`);
      return null;
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
      maxNotional,
    };
    const decision = vetBuy(ctx, strength);
    if (!decision.allowed) {
      storage.log("risk_block", `Buy blocked — ${decision.reason}`, this.activeStrategy.meta.id);
      return null;
    }

    const bar = candles[candles.length - 1];
    const order = await this.broker.submitOrder(
      {
        symbol,
        side: "buy",
        qty: decision.qty,
        reason,
        limitOffsetPct: config.limitOrderOffsetPct,
        makerOnly: config.makerOnlyEntries,
        bar: { high: bar.high, low: bar.low },
      },
      price,
    );
    this.ordersThisMinute++;
    await this.applyResolvedOrder(config, order, decision.reason);
    return order;
  }

  /**
   * Record the outcome of an order. Called both for orders that settle
   * immediately (market/stop) and — a tick later, via `resolvePending` — for
   * limit orders that had to rest until a bar elapsed against them.
   */
  private async applyResolvedOrder(config: BotConfig, order: Order, sizingNote?: string): Promise<void> {
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
      this.openEntries.set(order.symbol, {
        price: order.price,
        time: order.createdAt,
        strategyId: this.activeStrategy.meta.id,
      });
      // Park protection at the venue immediately. Until this exists the
      // position is only guarded while this process is alive — a laptop
      // closing overnight would leave it completely unprotected through a
      // 24/7 crypto market.
      void this.protectPosition(config, order);
      storage.log(
        "order",
        `BUY ${order.qty.toFixed(6)} ${order.symbol} @ ${order.price.toFixed(2)}` +
          `${order.fillType ? ` (${order.fillType})` : ""} — ${order.reason ?? ""}` +
          `${sizingNote ? ` (${sizingNote})` : ""}`,
        this.activeStrategy.meta.id,
      );
      sendAlert(
        "info",
        `BUY ${order.symbol}`,
        `${order.qty.toFixed(6)} @ ${order.price.toFixed(2)} (${config.mode}) — ${order.reason ?? ""}`,
      );
      return;
    }

    if (order.status !== "filled") {
      storage.log("info", `Sell rejected — ${order.message}`);
      return;
    }
    await this.recordSellFill(config, order);
  }

  /** Turn a filled exit into a completed Trade in the log. */
  private async recordSellFill(config: BotConfig, order: Order): Promise<void> {
    const entry = this.openEntries.get(order.symbol);
    if (!entry) {
      // No entry record for this symbol: booking a trade would invent a P&L.
      // Say so rather than silently recording a zero-profit round trip.
      storage.log(
        "info",
        `Exited ${order.symbol} with no recorded entry — P&L not booked for this trade`,
      );
    }
    const entryPrice = entry?.price ?? order.price;
    const entryTime = entry?.time ?? order.createdAt;
    const strategyId = entry?.strategyId ?? this.activeStrategy.meta.id;
    const reason = order.reason ?? "";
    const pnl = (order.price - entryPrice) * order.qty;
    const trade: Trade = {
      id: order.id,
      symbol: order.symbol,
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

    // Only forget the entry once the position is genuinely flat. Alpaca
    // reports a PARTIAL fill as status "filled" carrying just the executed
    // quantity, so deleting unconditionally orphaned the remainder: its next
    // exit found no entry, booked pnl = 0, and fed that fiction straight into
    // the Kelly multiplier and the confidence governor, both of which read the
    // trade history.
    const remaining = await this.broker.getPosition(order.symbol);
    if (!remaining || remaining.qty <= 1e-9) {
      this.openEntries.delete(order.symbol);
    } else {
      storage.log(
        "info",
        `Partial exit of ${order.symbol}: ${remaining.qty.toFixed(6)} still open, ` +
          `entry price retained for the remainder`,
      );
    }

    storage.log(
      "order",
      `SELL ${order.qty.toFixed(6)} ${order.symbol} @ ${order.price.toFixed(2)}` +
        `${order.fillType ? ` (${order.fillType})` : ""} — ${reason} | P&L ${
          pnl >= 0 ? "+" : ""
        }${pnl.toFixed(2)}`,
      strategyId,
    );
    sendAlert(
      "info",
      `SELL ${order.symbol}`,
      `${order.qty.toFixed(6)} @ ${order.price.toFixed(2)} (${config.mode}) — ${reason} | P&L ${
        pnl >= 0 ? "+" : ""
      }${pnl.toFixed(2)}`,
    );
  }

  /**
   * Place a venue-side stop-loss for a freshly opened position, so protection
   * survives this process dying. Engine-side stop checks stay as a faster
   * backstop for when it is running.
   */
  private async protectPosition(config: BotConfig, entry: Order): Promise<void> {
    if (!this.broker.placeProtectiveStop) return;
    const stopPrice = entry.price * (1 - config.stopLossPct);
    try {
      const stop = await this.broker.placeProtectiveStop(entry.symbol, entry.qty, stopPrice);
      if (!stop) return;
      if (stop.status === "rejected") {
        storage.log(
          "risk_block",
          `Could not park a stop at the venue for ${entry.symbol} (${stop.message}) — ` +
            `position is only protected while this app is running`,
        );
        sendAlert(
          "warning",
          "No venue-side stop",
          `${entry.symbol} has no resting stop at the broker. If this app stops, the ` +
            `position is unprotected.`,
        );
        return;
      }
      storage.log(
        "info",
        `Protective stop resting at broker for ${entry.symbol} @ ${stopPrice.toFixed(2)} ` +
          `(survives app restarts)`,
      );
    } catch (err) {
      storage.log("info", `Protective stop failed for ${entry.symbol}: ${(err as Error).message}`);
    }
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
    // Clear the venue stop first. Selling while it still rests risks the stop
    // firing afterwards against a position that no longer exists.
    if (this.broker.hasProtectiveStop?.(symbol)) {
      await this.broker.cancelProtectiveStop?.(symbol);
    }
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
    await this.applyResolvedOrder(config, order);
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

  /**
   * PANIC BUTTON. Sell everything at market and stand down.
   *
   * Deliberately not a strategy decision — no signals, no maker orders, no
   * risk-manager veto. When someone reaches for this they want to be flat,
   * and every "clever" behaviour is a way to still be holding something
   * afterwards:
   *
   *  - FORCE TAKER on every leg. A resting limit that never fills leaves you
   *    in the position you asked to be out of. Paying the spread is the point.
   *  - STOPS THE ENGINE FIRST, so the next tick cannot re-enter what this just
   *    closed. Doing it the other way round races the tick loop.
   *  - IGNORES THE KILL-SWITCH. `halted` blocks new entries; exits must never
   *    be blocked, least of all here.
   *  - CANCELS VENUE STOPS before selling, so a stop cannot fire afterwards
   *    against a position that no longer exists.
   *  - WALKS THE BROKER'S OWN POSITION LIST, not the configured universe, so
   *    something held outside the current universe still gets sold.
   *
   * Reports what it managed to sell and what it did not, per symbol. A partial
   * failure that reported success would be the worst possible outcome here.
   */
  async liquidateAll(reason = "Manual liquidation"): Promise<{
    stoppedEngine: boolean;
    sold: Array<{ symbol: string; qty: number; price: number }>;
    failed: Array<{ symbol: string; message: string }>;
  }> {
    // Stop first: a tick running concurrently could re-enter behind us.
    const wasRunning = this.running;
    if (wasRunning) this.stop();

    const config = storage.getConfig();
    const positions = await this.getPositions();
    const sold: Array<{ symbol: string; qty: number; price: number }> = [];
    const failed: Array<{ symbol: string; message: string }> = [];

    storage.log(
      "info",
      `Liquidating ${positions.length} position${positions.length === 1 ? "" : "s"} — ${reason}`,
    );

    for (const position of positions) {
      if (!position || position.qty <= 0) continue;
      const symbol = position.symbol;
      try {
        if (this.broker.hasProtectiveStop?.(symbol)) {
          await this.broker.cancelProtectiveStop?.(symbol);
        }
        // Mark at the last trade price; fall back to the position's own mark
        // when the feed is unavailable, because being unable to fetch a candle
        // must not prevent an exit.
        let price = position.markPrice;
        try {
          price = await this.feed.getPrice(symbol);
        } catch {
          /* keep the position's mark */
        }
        if (!(price > 0)) price = position.avgEntryPrice;

        const order = await this.broker.submitOrder(
          {
            symbol,
            side: "sell",
            qty: position.qty,
            reason,
            limitOffsetPct: 0,
            forceTaker: true,
          },
          price,
        );
        if (order.status === "filled") {
          await this.applyResolvedOrder(config, order);
          sold.push({ symbol, qty: order.qty, price: order.price });
        } else {
          failed.push({ symbol, message: order.message ?? `order ${order.status}` });
        }
      } catch (err) {
        failed.push({ symbol, message: (err as Error).message });
      }
    }

    const summary =
      `Liquidation complete — sold ${sold.length}` +
      (failed.length ? `, FAILED on ${failed.length}: ${failed.map((f) => f.symbol).join(", ")}` : "");
    storage.log(failed.length ? "risk_block" : "info", summary);
    sendAlert(
      failed.length ? "warning" : "info",
      failed.length ? "Liquidation incomplete" : "Liquidated to cash",
      summary,
    );

    return { stoppedEngine: wasRunning, sold, failed };
  }

  /** Latest confidence reading, or null before the first tick. */
  getConfidence(): ConfidenceResult | null {
    return this.confidence;
  }

  /**
   * Record why a symbol was skipped, ONCE per symbol until the reason changes.
   *
   * A 15-symbol universe on a 5s tick otherwise repeats the same line every
   * few seconds — 145 of 159 entries in one observed run were the identical
   * "At position limit" message, pushing the actual fills off the log.
   */
  private noteBlock(symbol: string, reason: string): void {
    if (this.lastRiskBlock.get(symbol) === reason) return;
    this.lastRiskBlock.set(symbol, reason);
    storage.log("risk_block", `${symbol}: ${reason}`, this.activeStrategy.meta.id);
  }

  /**
   * Every open position across the traded universe.
   *
   * getPosition() only ever looked at config.symbol, so once the engine could
   * hold several symbols the dashboard reported "no position" while three were
   * open — the primary symbol simply happened not to be one of them.
   */
  async getPositions(): Promise<Position[]> {
    const universe = this.universeOf(storage.getConfig());
    const fromBroker = await this.broker.listPositions?.();
    if (fromBroker) {
      return fromBroker.map((p) => ({ ...p, symbol: this.canonicalize(p.symbol, universe) }));
    }
    const out: Position[] = [];
    for (const symbol of universe) {
      const p = await this.broker.getPosition(symbol);
      if (p && p.qty > 0) out.push(p);
    }
    return out;
  }

  get feedSource(): "alpaca" | "synthetic" {
    return this.feed.source;
  }
}

export const engine = new TradingEngine();
