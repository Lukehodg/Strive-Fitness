// Broker abstraction. The engine only ever talks to the `Broker` interface, so
// swapping paper trading for a real account is a matter of which implementation
// is instantiated — nothing else in the system changes.

import { randomUUID } from "crypto";
import type { Order, OrderRequest, Position } from "@shared/schema";
import { ratesFor } from "./costs";
import { assetClassOf, positionSymbol, roundQtyFor, timeInForce } from "./assets";
import {
  limitPriceFor,
} from "./execution";

export interface AccountSnapshot {
  cash: number;
  /** Marked-to-market value of all open positions. */
  positionsValue: number;
  /** cash + positionsValue. */
  equity: number;
}

export interface Broker {
  readonly kind: "paper" | "alpaca";
  /**
   * Submit an order. Resolves with the resulting fill, a rejection, or —
   * for a simulated resting limit order — a `pending` status that a later
   * `resolvePending` call settles.
   */
  submitOrder(req: OrderRequest, markPrice: number): Promise<Order>;
  /** Current open position for a symbol, or null if flat. */
  getPosition(symbol: string): Promise<Position | null>;
  /**
   * EVERY open position, whatever the configured universe says.
   *
   * Discovery must come from the broker, not from config: change the universe
   * while holding something and a config-driven scan stops seeing it, so the
   * position gets no exits, no take-profit, and stops counting toward the
   * exposure limits — while the account still very much owns it.
   */
  listPositions?(): Promise<Position[]>;
  /**
   * Account cash/equity, or NULL when the broker cannot be reached.
   *
   * Null must not be conflated with an empty account. Returning zeroes on a
   * failed request made a transient outage look like a total wipeout: the
   * daily-loss kill-switch read equity 0 against the day's opening balance and
   * halted trading with "daily loss limit reached", and position sizing would
   * have sized against zero equity. Observed live when the broker restarted
   * mid-run.
   */
  getAccount(markPrice?: number): Promise<AccountSnapshot | null>;
  /** Update the mark price used for unrealized P&L. */
  mark(symbol: string, price: number): void;
  /**
   * Settle any resting limit orders against the bar that has just elapsed.
   * Only simulated brokers need this — a real venue manages its own book.
   */
  resolvePending?(
    bars: Record<string, { high: number; low: number; close: number }>,
  ): Order[] | Promise<Order[]>;
  /**
   * Whether this instrument can be traded right now. Crypto is 24/7, but US
   * equities are closed nights, weekends and holidays — roughly 75% of the
   * time — so without this the engine would fire orders into a shut market.
   */
  isMarketOpen?(symbol: string): boolean | Promise<boolean>;
  /**
   * When the current session ends, for day-trading flatten rules. Null for
   * instruments that never close (crypto) or when the venue cannot say.
   */
  sessionCloseAt?(symbol: string): Promise<number | null>;
  /**
   * Park a stop-loss AT THE VENUE so the position stays protected even if
   * this process dies. Engine-side stops only work while the engine runs;
   * a laptop closing overnight otherwise leaves a position completely
   * unguarded through a 24/7 crypto market.
   *
   * Returns null when the broker cannot do this (the paper broker IS the
   * app, so venue-side protection is meaningless there).
   */
  placeProtectiveStop?(
    symbol: string,
    qty: number,
    stopPrice: number,
  ): Promise<Order | null>;
  /** Cancel a resting venue stop, e.g. before exiting for another reason. */
  cancelProtectiveStop?(symbol: string): Promise<void>;
  /** True when a venue-side stop is currently protecting this symbol. */
  hasProtectiveStop?(symbol: string): boolean;
}

// ---------------------------------------------------------------------------
// PaperBroker — fully in-memory simulated fills. No credentials, no network.
// ---------------------------------------------------------------------------

/** An order resting on the simulated book, awaiting the next bar. */
interface RestingOrder {
  base: Order;
  req: OrderRequest;
  limitPrice: number;
  isExit: boolean;
}

export class PaperBroker implements Broker {
  readonly kind = "paper" as const;
  private cash: number;
  private positions = new Map<string, Position>();
  private resting: RestingOrder[] = [];

  constructor(startingCash = 10_000) {
    this.cash = startingCash;
  }

  async submitOrder(req: OrderRequest, markPrice: number): Promise<Order> {
    const base: Order = {
      id: randomUUID(),
      symbol: req.symbol,
      side: req.side,
      qty: req.qty,
      price: markPrice,
      status: "pending",
      reason: req.reason,
      createdAt: Date.now(),
    };

    if (req.qty <= 0 || markPrice <= 0) {
      return { ...base, status: "rejected", message: "Invalid quantity or price" };
    }

    // This system is long/flat-only, so a sell is always an exit.
    const isExit = req.side === "sell";
    const offset = req.limitOffsetPct ?? 0;
    const wantsMaker = !(req.forceTaker ?? false) && offset > 0;

    // A resting limit order can only be settled by a bar that elapses AFTER
    // it is placed. We do not have that bar yet, so the order genuinely
    // rests — resolvePending() settles it on the next tick. Deciding the fill
    // now, from the bar that produced `markPrice`, would be lookahead: that
    // bar has already closed, so its range is known.
    if (wantsMaker) {
      const limitPrice = limitPriceFor(req.side, markPrice, offset);
      if (isExit) {
        const existing = this.positions.get(req.symbol);
        if (!existing || existing.qty < req.qty - 1e-9) {
          return { ...base, status: "rejected", message: "No position to sell" };
        }
      } else if (req.qty * limitPrice * (1 + ratesFor(req.symbol).makerFee) > this.cash + 1e-9) {
        return { ...base, status: "rejected", message: "Insufficient cash" };
      }
      const pending: Order = { ...base, status: "pending", price: limitPrice };
      this.resting.push({ base: pending, req, limitPrice, isExit });
      return pending;
    }

    // Maker-only entry that cannot rest (offset 0). Skipping costs nothing but
    // the opportunity; crossing costs the spread on every single entry.
    if (req.makerOnly && !isExit && !(req.forceTaker ?? false)) {
      return { ...base, status: "rejected", message: "Maker-only: would have to cross, skipped" };
    }

    // Market / forced-taker order: fills immediately at the reference price.
    const rates = ratesFor(req.symbol);
    return this.settle(
      base,
      req,
      markPrice * (req.side === "buy" ? 1 + rates.takerSlippage : 1 - rates.takerSlippage),
      rates.takerFee,
      "taker",
      markPrice,
    );
  }

  /**
   * Settle resting orders against the bar that has now elapsed. Touched
   * limits fill as makers; an untouched EXIT falls back to a taker fill
   * (an exit that never happens is a risk failure, not a saving), while an
   * untouched ENTRY is simply cancelled and the strategy re-evaluates.
   */
  resolvePending(
    bars: Record<string, { high: number; low: number; close: number }>,
  ): Order[] {
    if (!this.resting.length) return [];
    const queue = this.resting;
    const out: Order[] = [];
    // Only settle orders we actually have a fresh bar for; anything else keeps
    // resting. Settling every symbol against one symbol's bar would fill
    // orders on price action that never happened in that instrument.
    this.resting = queue.filter((r) => !bars[r.req.symbol]);

    for (const r of queue) {
      const bar = bars[r.req.symbol];
      if (!bar) continue;
      const markPrice = bar.close;
      const touched =
        r.req.side === "buy" ? bar.low <= r.limitPrice : bar.high >= r.limitPrice;
      if (touched) {
        out.push(this.settle(r.base, r.req, r.limitPrice, ratesFor(r.req.symbol).makerFee, "maker", markPrice));
      } else if (r.isExit) {
        const exitRates = ratesFor(r.req.symbol);
        const takerPrice = markPrice * (1 - exitRates.takerSlippage);
        out.push(this.settle(r.base, r.req, takerPrice, exitRates.takerFee, "taker", markPrice));
      } else {
        out.push({
          ...r.base,
          status: "rejected",
          message: "Resting buy not filled — cancelled, will re-evaluate",
        });
      }
    }
    return out;
  }

  /** Apply cash/position effects of a fill and produce the final Order. */
  private settle(
    base: Order,
    req: OrderRequest,
    fillPrice: number,
    feeRate: number,
    fillType: "maker" | "taker",
    markPrice: number,
  ): Order {
    const notional = req.qty * fillPrice;
    const fee = notional * feeRate;

    if (req.side === "buy") {
      if (notional + fee > this.cash + 1e-9) {
        return { ...base, status: "rejected", message: "Insufficient cash" };
      }
      this.cash -= notional + fee;
      const existing = this.positions.get(req.symbol);
      if (existing) {
        const totalQty = existing.qty + req.qty;
        existing.avgEntryPrice =
          (existing.avgEntryPrice * existing.qty + fillPrice * req.qty) / totalQty;
        existing.qty = totalQty;
        existing.markPrice = markPrice;
      } else {
        this.positions.set(req.symbol, {
          symbol: req.symbol,
          qty: req.qty,
          avgEntryPrice: fillPrice,
          markPrice,
          unrealizedPnl: 0,
          openedAt: Date.now(),
        });
      }
    } else {
      const existing = this.positions.get(req.symbol);
      if (!existing || existing.qty < req.qty - 1e-9) {
        return { ...base, status: "rejected", message: "No position to sell" };
      }
      this.cash += notional - fee;
      existing.qty -= req.qty;
      if (existing.qty <= 1e-9) this.positions.delete(req.symbol);
    }

    return { ...base, status: "filled", price: fillPrice, fillType };
  }

  async getPosition(symbol: string): Promise<Position | null> {
    return this.positions.get(symbol) ?? null;
  }

  async listPositions(): Promise<Position[]> {
    return Array.from(this.positions.values()).filter((p) => p.qty > 0);
  }

  async getAccount(markPrice?: number): Promise<AccountSnapshot> {
    let positionsValue = 0;
    for (const p of Array.from(this.positions.values())) {
      // Each position is valued at ITS OWN mark. Using a single caller-supplied
      // price valued every holding at one symbol's price — harmless while only
      // one symbol could be held, badly wrong the moment the engine holds two.
      const mark = p.markPrice > 0 ? p.markPrice : (markPrice ?? 0);
      positionsValue += p.qty * mark;
    }
    return {
      cash: this.cash,
      positionsValue,
      equity: this.cash + positionsValue,
    };
  }

  mark(symbol: string, price: number): void {
    const p = this.positions.get(symbol);
    if (p) {
      p.markPrice = price;
      p.unrealizedPnl = (price - p.avgEntryPrice) * p.qty;
    }
  }

  /** Serialize simulated balance + positions (for restart persistence). */
  snapshot(): { cash: number; positions: Position[] } {
    return { cash: this.cash, positions: Array.from(this.positions.values()) };
  }

  restore(data: { cash: number; positions: Position[] }): void {
    if (typeof data?.cash === "number") this.cash = data.cash;
    if (Array.isArray(data?.positions)) {
      this.positions.clear();
      for (const p of data.positions) this.positions.set(p.symbol, p);
    }
  }
}

// ---------------------------------------------------------------------------
// AlpacaBroker — real orders against Alpaca's trading API.
//
// Alpaca exposes the SAME REST surface for paper and live; only the base URL
// and the keys differ. This adapter is used when the user opts into real
// trading and supplies credentials. It is intentionally minimal (market
// orders only) and shares the PaperBroker's interface exactly.
// ---------------------------------------------------------------------------

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
  /** Base trading URL, e.g. https://paper-api.alpaca.markets */
  baseUrl: string;
}

/** Alpaca order states that are final — no further transition is coming. */
const ALPACA_TERMINAL = new Set([
  "filled",
  "canceled",
  "expired",
  "rejected",
  "done_for_day",
  "stopped",
  "suspended",
]);

/** Smallest order notional worth sending (Alpaca crypto rejects dust). */
const MIN_NOTIONAL = 1;

export class AlpacaBroker implements Broker {
  readonly kind = "alpaca" as const;
  private lastMark = new Map<string, number>();
  /** Orders submitted to the venue that have not reached a terminal state. */
  private working = new Map<string, { req: OrderRequest; base: Order; isExit: boolean }>();
  private clockCache: { open: boolean; nextClose: number | null; expires: number } | null = null;
  /** symbol -> venue order id of the resting protective stop. */
  private protectiveStops = new Map<string, string>();

  constructor(private creds: AlpacaCredentials) {}

  private headers() {
    return {
      "APCA-API-KEY-ID": this.creds.keyId,
      "APCA-API-SECRET-KEY": this.creds.secretKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Submit an order and report ONLY what the venue confirms.
   *
   * The previous implementation returned `status: res.ok ? "filled" : ...`
   * with `price: filled_avg_price || markPrice`. Both are wrong for real
   * money: a market order POST returns HTTP 200 with status "accepted"/"new"
   * and a null `filled_avg_price`, so the engine recorded a position it did
   * not yet own, at a price it had invented from the last candle close. Every
   * downstream P&L, stop-loss and take-profit then keyed off that fiction —
   * including the daily-loss kill-switch.
   *
   * Now an unfilled order comes back `pending` and is reconciled against the
   * venue in resolvePending(), so recorded fills are always real fills at
   * real prices.
   */
  async submitOrder(req: OrderRequest, markPrice: number): Promise<Order> {
    const offsetRaw = req.limitOffsetPct ?? 0;
    const wantLimit = !(req.forceTaker ?? false) && offsetRaw > 0;
    // Equities reject FRACTIONAL limit orders, so a sub-share position has to
    // cross as a market order. roundQtyFor tells us which we actually get.
    const rounded = roundQtyFor(req.symbol, req.qty, wantLimit);
    const qty = rounded.qty;
    const base: Order = {
      id: "unsubmitted",
      symbol: req.symbol,
      side: req.side,
      qty,
      price: markPrice,
      status: "pending",
      reason: req.reason,
      createdAt: Date.now(),
    };

    if (!(qty > 0) || !(markPrice > 0)) {
      return { ...base, status: "rejected", message: "Invalid quantity or price" };
    }
    if (qty * markPrice < MIN_NOTIONAL) {
      return {
        ...base,
        status: "rejected",
        message: `Order notional ${(qty * markPrice).toFixed(2)} below venue minimum ${MIN_NOTIONAL}`,
      };
    }

    // Honour the maker-first policy the backtester assumes. Sending a market
    // order for everything (the previous behaviour) meant live paid taker fees
    // plus spread on every trade while backtests priced ~88% of fills as
    // makers — a systematic overstatement of live returns.
    const useLimit = rounded.canUseLimit;

    // Maker-only entry that CANNOT be a limit order. This is the live-only
    // leak: an equity order for under one share is fractional, Alpaca rejects
    // fractional limits, so roundQtyFor silently downgrades it to a market
    // order. On a small account every equity position is sub-share, so entries
    // crossed the spread every time no matter how limitOffsetPct was set.
    if (req.makerOnly && !useLimit && req.side === "buy" && !(req.forceTaker ?? false)) {
      return {
        ...base,
        status: "rejected",
        message: "Maker-only: fractional order cannot rest as a limit, skipped",
      };
    }

    const limitPrice = useLimit ? limitPriceFor(req.side, markPrice, offsetRaw) : 0;

    const body: Record<string, unknown> = {
      symbol: req.symbol,
      qty: String(qty),
      side: req.side,
      type: useLimit ? "limit" : "market",
      time_in_force: timeInForce(req.symbol),
    };
    if (useLimit) body.limit_price = limitPrice.toFixed(2);

    let data: any;
    try {
      const res = await fetch(`${this.creds.baseUrl}/v2/orders`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ...base,
          status: "rejected",
          message: data?.message || `HTTP ${res.status}`,
        };
      }
    } catch (err) {
      return { ...base, status: "rejected", message: `Network error: ${(err as Error).message}` };
    }

    const submitted: Order = { ...base, id: String(data.id ?? "unknown") };
    const resolved = this.fromVenue(submitted, data);
    if (resolved.status !== "pending") return resolved;

    this.working.set(submitted.id, { req: { ...req, qty }, base: submitted, isExit: req.side === "sell" });
    return { ...submitted, price: useLimit ? limitPrice : markPrice };
  }

  /** Translate a venue order payload into our Order, or leave it pending. */
  private fromVenue(base: Order, data: any): Order {
    const status = String(data?.status ?? "");
    const filledQty = Number(data?.filled_qty ?? 0);
    const filledPrice = Number(data?.filled_avg_price ?? 0);

    if (status === "filled" && filledQty > 0 && filledPrice > 0) {
      return {
        ...base,
        status: "filled",
        qty: filledQty,
        price: filledPrice,
        fillType: String(data?.type) === "limit" ? "maker" : "taker",
      };
    }
    if (ALPACA_TERMINAL.has(status)) {
      // Partial fills still count for what actually executed.
      if (filledQty > 0 && filledPrice > 0) {
        return {
          ...base,
          status: "filled",
          qty: filledQty,
          price: filledPrice,
          fillType: String(data?.type) === "limit" ? "maker" : "taker",
          message: `Partially filled (${status})`,
        };
      }
      return { ...base, status: "rejected", message: `Venue reported ${status}` };
    }
    return { ...base, status: "pending" };
  }

  /**
   * Reconcile working orders against the venue. Mirrors PaperBroker's
   * semantics so backtest and live behave the same: an unfilled ENTRY is
   * cancelled and re-evaluated next tick, while an unfilled EXIT is escalated
   * to a market order, because an exit that never happens is a risk failure.
   */
  async resolvePending(
    bars: Record<string, { high: number; low: number; close: number }>,
  ): Promise<Order[]> {
    if (!this.working.size) return [];
    const out: Order[] = [];

    for (const [id, entry] of Array.from(this.working.entries())) {
      let data: any;
      try {
        const res = await fetch(`${this.creds.baseUrl}/v2/orders/${id}`, {
          headers: this.headers(),
        });
        if (!res.ok) continue; // transient — try again next tick
        data = await res.json();
      } catch {
        continue;
      }

      const settled = this.fromVenue(entry.base, data);
      if (settled.status !== "pending") {
        this.working.delete(id);
        out.push(settled);
        continue;
      }

      // Still working. Don't let it linger: cancel, and for an exit escalate.
      await this.cancel(id);
      this.working.delete(id);
      if (entry.isExit) {
        const markPrice = bars[entry.req.symbol]?.close ?? entry.base.price;
        const market = await this.submitOrder(
          { ...entry.req, forceTaker: true, limitOffsetPct: 0 },
          markPrice,
        );
        out.push(market);
      } else {
        out.push({
          ...entry.base,
          status: "rejected",
          message: "Resting buy not filled — cancelled, will re-evaluate",
        });
      }
    }
    return out;
  }

  private async cancel(id: string): Promise<void> {
    try {
      await fetch(`${this.creds.baseUrl}/v2/orders/${id}`, {
        method: "DELETE",
        headers: this.headers(),
      });
    } catch {
      /* best effort — the next reconcile will pick up the true state */
    }
  }

  async getPosition(symbol: string): Promise<Position | null> {
    // Crypto positions drop the slash (BTCUSD); equities use the bare ticker.
    const sym = positionSymbol(symbol);
    try {
      const res = await fetch(`${this.creds.baseUrl}/v2/positions/${sym}`, {
        headers: this.headers(),
      });
      if (!res.ok) return null; // 404 = flat
      const p: any = await res.json();
      const qty = Number(p.qty);
      if (!(qty > 0)) return null;
      const avg = Number(p.avg_entry_price);
      const mark = Number(p.current_price) || this.lastMark.get(symbol) || avg;
      return {
        symbol,
        qty,
        avgEntryPrice: avg,
        markPrice: mark,
        unrealizedPnl: Number(p.unrealized_pl) || (mark - avg) * qty,
        openedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  /** Every open position at the venue, regardless of configured universe. */
  async listPositions(): Promise<Position[]> {
    try {
      const res = await fetch(`${this.creds.baseUrl}/v2/positions`, { headers: this.headers() });
      if (!res.ok) return [];
      const raw: any[] = await res.json();
      if (!Array.isArray(raw)) return [];
      return raw
        .map((p) => {
          const qty = Number(p.qty);
          const avg = Number(p.avg_entry_price);
          const mark = Number(p.current_price) || avg;
          return {
            symbol: String(p.symbol),
            qty,
            avgEntryPrice: avg,
            markPrice: mark,
            unrealizedPnl: Number(p.unrealized_pl) || (mark - avg) * qty,
            openedAt: Date.now(),
          } as Position;
        })
        .filter((p) => p.qty > 0);
    } catch {
      return [];
    }
  }

  /**
   * NOTE: this reports the WHOLE account. Position sizing (maxPositionPct)
   * and the daily-loss kill-switch therefore measure against everything in
   * the account, including assets this bot never traded. Use a dedicated
   * Alpaca account for the bot so those limits mean what you expect.
   */
  async getAccount(markPrice?: number): Promise<AccountSnapshot | null> {
    try {
      const res = await fetch(`${this.creds.baseUrl}/v2/account`, {
        headers: this.headers(),
      });
      if (!res.ok) return null;
      const a: any = await res.json();
      const cash = Number(a.cash) || 0;
      const equity = Number(a.equity) || cash;
      return { cash, positionsValue: equity - cash, equity };
    } catch {
      // Unreachable != empty. Say "unknown" and let the caller stand down.
      return null;
    }
  }

  mark(symbol: string, price: number): void {
    this.lastMark.set(symbol, price);
  }

  /** Session close for equities; null for crypto, which never closes. */
  async sessionCloseAt(symbol: string): Promise<number | null> {
    if (assetClassOf(symbol) === "crypto") return null;
    await this.isMarketOpen(symbol); // refreshes the cached clock
    return this.clockCache?.nextClose ?? null;
  }

  /**
   * Place a resting stop-loss at the venue.
   *
   * Deliberately the stop only, not a bracket with a take-profit attached:
   * Alpaca does not support OCO/bracket orders for crypto, so a paired
   * take-profit would have to be managed by this process — and if it fills
   * while the process is down, the stop would remain live against a position
   * that no longer exists. Losing a take-profit to downtime costs upside;
   * losing a stop costs money, so only the stop is parked at the venue.
   */
  async placeProtectiveStop(
    symbol: string,
    qty: number,
    stopPrice: number,
  ): Promise<Order | null> {
    const rounded = roundQtyFor(symbol, qty, false);
    if (!(rounded.qty > 0) || !(stopPrice > 0)) return null;
    await this.cancelProtectiveStop(symbol);

    const isCrypto = assetClassOf(symbol) === "crypto";
    const body: Record<string, unknown> = {
      symbol,
      qty: String(rounded.qty),
      side: "sell",
      // Crypto supports stop_limit but not plain stop; equities take either.
      // The limit sits below the trigger so the order still fills through a
      // fast move instead of chasing the price down.
      type: isCrypto ? "stop_limit" : "stop",
      stop_price: stopPrice.toFixed(2),
      // Protection must outlive the session, so GTC on both asset classes.
      time_in_force: "gtc",
    };
    if (isCrypto) body.limit_price = (stopPrice * 0.995).toFixed(2);

    try {
      const res = await fetch(`${this.creds.baseUrl}/v2/orders`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          id: "unsubmitted",
          symbol,
          side: "sell",
          qty: rounded.qty,
          price: stopPrice,
          status: "rejected",
          message: data?.message || `HTTP ${res.status}`,
          createdAt: Date.now(),
        };
      }
      this.protectiveStops.set(symbol, String(data.id));
      return {
        id: String(data.id),
        symbol,
        side: "sell",
        qty: rounded.qty,
        price: stopPrice,
        status: "pending",
        reason: "Protective stop (resting at venue)",
        createdAt: Date.now(),
      };
    } catch (err) {
      return {
        id: "unsubmitted",
        symbol,
        side: "sell",
        qty: rounded.qty,
        price: stopPrice,
        status: "rejected",
        message: `Network error: ${(err as Error).message}`,
        createdAt: Date.now(),
      };
    }
  }

  async cancelProtectiveStop(symbol: string): Promise<void> {
    const id = this.protectiveStops.get(symbol);
    if (!id) return;
    this.protectiveStops.delete(symbol);
    await this.cancel(id);
  }

  hasProtectiveStop(symbol: string): boolean {
    return this.protectiveStops.has(symbol);
  }

  /**
   * Crypto trades continuously. For equities we ask Alpaca's clock rather
   * than hardcoding 09:30-16:00 ET, because that would silently trade through
   * market holidays and half-days. Cached briefly so it costs one call a
   * minute, not one per tick.
   */
  async isMarketOpen(symbol: string): Promise<boolean> {
    if (assetClassOf(symbol) === "crypto") return true;
    const now = Date.now();
    if (this.clockCache && now < this.clockCache.expires) return this.clockCache.open;
    try {
      const res = await fetch(`${this.creds.baseUrl}/v2/clock`, { headers: this.headers() });
      if (!res.ok) return this.clockCache?.open ?? true;
      const c: any = await res.json();
      const open = Boolean(c?.is_open);
      const nextClose = c?.next_close ? new Date(c.next_close).getTime() : null;
      this.clockCache = {
        open,
        nextClose: Number.isFinite(nextClose) ? nextClose : null,
        expires: now + 60_000,
      };
      return open;
    } catch {
      // Network blip: fall back to the last known state rather than blocking
      // trading outright, and never cache the failure.
      return this.clockCache?.open ?? true;
    }
  }
}

/**
 * Reads Alpaca credentials from the environment. Returns null when live
 * trading isn't configured, which keeps the platform in paper mode.
 */
export function readAlpacaCredentials(): AlpacaCredentials | null {
  const keyId = process.env.ALPACA_KEY_ID?.trim();
  const secretKey = process.env.ALPACA_SECRET_KEY?.trim();
  if (!keyId || !secretKey) return null;
  const baseUrl = normalizeAlpacaBaseUrl(process.env.ALPACA_BASE_URL);
  return { keyId, secretKey, baseUrl };
}

/**
 * Normalize the trading endpoint to a bare origin.
 *
 * Alpaca's dashboard shows the endpoint WITH the API version appended
 * ("https://paper-api.alpaca.markets/v2"), so pasting it verbatim is the
 * obvious thing to do — but every request in this file appends "/v2" itself,
 * which would produce "/v2/v2/orders" and 404 on absolutely everything.
 * Strip a trailing slash and a trailing version segment so both forms work.
 */
export function normalizeAlpacaBaseUrl(raw?: string): string {
  const fallback = "https://paper-api.alpaca.markets";
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/\/+$/, "").replace(/\/v\d+$/, "");
}
