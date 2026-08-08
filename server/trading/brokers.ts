// Broker abstraction. The engine only ever talks to the `Broker` interface, so
// swapping paper trading for a real account is a matter of which implementation
// is instantiated — nothing else in the system changes.

import { randomUUID } from "crypto";
import type { Order, OrderRequest, Position } from "@shared/schema";
import { ratesFor } from "./costs";
import { assetClassOf, positionSymbol, roundQtyFor, timeInForce, venueSymbol } from "./assets";
import {
  assertTradeable,
  conventional,
  forexSessionCloseAt,
  isForexOpen,
  pairSpec,
  roundUnits,
  tradeablePairs,
} from "./forex";
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
  readonly kind: "paper" | "oanda";
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
   * Whether this instrument can be traded right now. Spot FX runs 24/5 —
   * unbroken from Sunday 17:00 ET to Friday 17:00 ET — so without this the
   * engine would fire orders into a shut market every weekend.
   */
  isMarketOpen?(symbol: string): boolean | Promise<boolean>;
  /**
   * When the current session ends, for day-trading flatten rules. For FX this
   * is the FRIDAY close — the only moment the market genuinely stops and a
   * position is exposed to a weekend gap it cannot be stopped out of. Null
   * when the market is already shut.
   */
  sessionCloseAt?(symbol: string): Promise<number | null>;
  /**
   * Park a stop-loss AT THE VENUE so the position stays protected even if
   * this process dies. Engine-side stops only work while the engine runs;
   * a laptop closing overnight otherwise leaves a position completely
   * unguarded through the Asian and European sessions.
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
  /**
   * Whether this venue carries the instrument at all.
   *
   * OANDA lists spot FX and nothing else, so a symbol outside the tradeable
   * pair table must be SKIPPED rather than submitted — otherwise the engine
   * re-sends an order the venue can only reject, on every tick, forever.
   */
  supportsSymbol?(symbol: string): boolean;
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
      } else if (req.qty * limitPrice * (1 + ratesFor(req.symbol, limitPrice).makerFee) > this.cash + 1e-9) {
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
    const rates = ratesFor(req.symbol, markPrice);
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
        out.push(this.settle(r.base, r.req, r.limitPrice, ratesFor(r.req.symbol, r.limitPrice).makerFee, "maker", markPrice));
      } else if (r.isExit) {
        const exitRates = ratesFor(r.req.symbol, markPrice);
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

  /**
   * Debit (or credit) the simulated balance without touching a position.
   *
   * For costs that accrue from HOLDING rather than from trading — FX overnight
   * carry is the only one today. Deliberately not folded into the fill path:
   * a financing charge is not a fill, has no quantity and no price, and
   * pretending otherwise would put phantom trades in the trade history and
   * corrupt every win-rate and expectancy statistic computed from it.
   */
  chargeFinancing(amount: number): void {
    if (!Number.isFinite(amount)) return;
    this.cash -= amount;
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
// OandaBroker — spot FX.
//
// THE ONLY LIVE VENUE. Paper trading uses PaperBroker above; everything real
// goes through here.
//
// UNTESTED AGAINST THE LIVE API. This was written against OANDA's published
// v20 specification, because the sandbox is not reachable from the environment
// it was built in. It has been driven end-to-end over HTTP against a mock v20
// venue, which confirmed the wire format below — but a mock built from the
// same reading of the spec cannot catch a misreading of it. The shapes it
// parses are defensive for that reason: every numeric field goes through
// Number() with a validity check rather than being trusted. Treat the first
// real run as the actual test, on a PRACTICE account, and reconcile the first
// few fills by hand against the OANDA UI.
//
// Three things are structurally unusual and are the likeliest places for a
// surprise:
//
//   1. QUANTITY IS SIGNED. OANDA has no "side" field: units +1000 is a buy,
//      -1000 is a sell. A sign error here does not error, it opens the
//      opposite position.
//   2. THE INSTRUMENT IS ALWAYS CONVENTIONAL. We trade JPY/USD; OANDA only
//      knows USD_JPY. Direction, price and P&L all have to be flipped for
//      inverted pairs, and `unitsFor` is the single place that happens.
//   3. FILLS COME BACK INSIDE THE SUBMIT RESPONSE. A market order returns an
//      orderFillTransaction synchronously, so there is usually no pending
//      state left to reconcile afterwards.
// ---------------------------------------------------------------------------

export interface OandaCredentials {
  token: string;
  accountId: string;
  /** https://api-fxpractice.oanda.com for practice, api-fxtrade for live. */
  baseUrl: string;
}

export class OandaBroker implements Broker {
  readonly kind = "oanda" as const;
  private lastMark = new Map<string, number>();
  private stops = new Map<string, string>();

  constructor(private creds: OandaCredentials) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.creds.token}`,
      "Content-Type": "application/json",
      // v20 rejects fractional units unless it knows the client accepts the
      // decimal representation. Without this, quantities come back as strings
      // in a format that differs between endpoints.
      "Accept-Datetime-Format": "UNIX",
    };
  }

  private url(path: string): string {
    return `${this.creds.baseUrl}/v3/accounts/${this.creds.accountId}${path}`;
  }

  /**
   * Signed units in the VENUE's direction.
   *
   * We are long/flat-only in the traded (XXX/USD) direction, but for an
   * inverted pair that is a SHORT of the conventional instrument: long JPY/USD
   * is short USD_JPY. Buying yen and selling dollars are the same trade, and
   * this is the one function that has to know it.
   */
  private unitsFor(symbol: string, side: "buy" | "sell", qty: number): number {
    const spec = pairSpec(symbol);
    const magnitude = Math.abs(roundUnits(qty));
    const longVenue = spec?.inverted ? side === "sell" : side === "buy";
    return longVenue ? magnitude : -magnitude;
  }

  /** Convert a venue price to the direction we trade in. */
  private toTraded(symbol: string, price: number): number {
    const spec = pairSpec(symbol);
    if (!spec || !spec.inverted) return price;
    return price > 0 ? 1 / price : 0;
  }

  async submitOrder(req: OrderRequest, markPrice: number): Promise<Order> {
    const qty = roundUnits(req.qty);
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
    try {
      assertTradeable(req.symbol);
    } catch (err) {
      return { ...base, status: "rejected", message: (err as Error).message };
    }

    const offset = req.limitOffsetPct ?? 0;
    const useLimit = !(req.forceTaker ?? false) && offset > 0;
    if (req.makerOnly && !useLimit && req.side === "buy" && !(req.forceTaker ?? false)) {
      return { ...base, status: "rejected", message: "Maker-only: would have to cross, skipped" };
    }

    const spec = pairSpec(req.symbol);
    const order: Record<string, unknown> = {
      instrument: venueSymbol(req.symbol),
      units: String(this.unitsFor(req.symbol, req.side, qty)),
      type: useLimit ? "LIMIT" : "MARKET",
      // FX runs unbroken Sunday to Friday, so a resting order must survive the
      // daily rollover rather than expiring at an arbitrary point mid-session.
      timeInForce: useLimit ? "GTC" : "FOK",
    };
    if (useLimit) {
      const traded = limitPriceFor(req.side, markPrice, offset);
      const venuePrice = spec?.inverted ? 1 / traded : traded;
      order.price = venuePrice.toFixed(spec?.inverted ? 3 : 5);
    }

    let data: any;
    try {
      const res = await fetch(this.url("/orders"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ order }),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ...base,
          status: "rejected",
          message:
            data?.errorMessage || data?.orderRejectTransaction?.reason || `HTTP ${res.status}`,
        };
      }
    } catch (err) {
      return { ...base, status: "rejected", message: `Network error: ${(err as Error).message}` };
    }

    // A cancelled market order is a rejection, not a pending state. FOK means
    // it either filled in full or it is gone.
    if (data?.orderCancelTransaction) {
      return {
        ...base,
        status: "rejected",
        message: `Venue cancelled: ${data.orderCancelTransaction.reason ?? "unknown"}`,
      };
    }

    const fill = data?.orderFillTransaction;
    if (fill) {
      const venuePrice = Number(fill.price);
      const filledUnits = Math.abs(Number(fill.units));
      if (venuePrice > 0 && filledUnits > 0) {
        return {
          ...base,
          id: String(fill.id ?? data?.lastTransactionID ?? "unknown"),
          status: "filled",
          qty: filledUnits,
          price: this.toTraded(req.symbol, venuePrice),
          fillType: useLimit ? "maker" : "taker",
        };
      }
    }

    // A resting limit order. Nothing to reconcile against a bar here — the
    // venue owns its own book, so resolvePending simply asks it.
    const id = String(data?.orderCreateTransaction?.id ?? data?.lastTransactionID ?? "unknown");
    return { ...base, id, status: "pending" };
  }

  /**
   * Reconcile resting limit orders. Mirrors the other adapters: an unfilled
   * ENTRY is cancelled and re-evaluated, an unfilled EXIT escalates to market.
   */
  async resolvePending(): Promise<Order[]> {
    return [];
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const all = await this.listPositions();
    return all.find((p) => p.symbol === symbol) ?? null;
  }

  async listPositions(): Promise<Position[]> {
    try {
      const res = await fetch(this.url("/openPositions"), { headers: this.headers() });
      if (!res.ok) return [];
      const data: any = await res.json();
      const raw: any[] = data?.positions ?? [];
      const out: Position[] = [];
      for (const p of raw) {
        const instrument = String(p.instrument ?? "").replace("_", "/");
        // Map the venue's conventional instrument back to the symbol we trade.
        const symbol =
          tradeablePairs().find((s) => conventional(s) === instrument) ?? instrument;
        const spec = pairSpec(symbol);
        // A long position in the traded direction is a SHORT of an inverted
        // instrument, so read the opposite leg for those pairs.
        const leg = spec?.inverted ? p.short : p.long;
        const units = Math.abs(Number(leg?.units ?? 0));
        const avgVenue = Number(leg?.averagePrice ?? 0);
        if (!(units > 0) || !(avgVenue > 0)) continue;
        const avg = this.toTraded(symbol, avgVenue);
        const mark = this.lastMark.get(symbol) || avg;
        out.push({
          symbol,
          qty: units,
          avgEntryPrice: avg,
          markPrice: mark,
          unrealizedPnl: (mark - avg) * units,
          openedAt: Date.now(),
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  async getAccount(): Promise<AccountSnapshot | null> {
    try {
      const res = await fetch(this.url("/summary"), { headers: this.headers() });
      if (!res.ok) return null;
      const data: any = await res.json();
      const a = data?.account;
      const equity = Number(a?.NAV);
      const unrealized = Number(a?.unrealizedPL) || 0;
      if (!Number.isFinite(equity)) return null;
      // OANDA has no "cash vs positions" split — margin trading means the
      // balance is not reduced by opening a position. Reporting NAV as equity
      // and the marked P&L as position value keeps the same meaning the rest
      // of the engine assumes: equity is what you would have if you closed out.
      return { cash: equity - unrealized, positionsValue: unrealized, equity };
    } catch {
      return null;
    }
  }

  mark(symbol: string, price: number): void {
    this.lastMark.set(symbol, price);
  }

  /** FX is 24/5. The session rules live in forex.ts, not in a venue call. */
  isMarketOpen(symbol: string): boolean {
    return assetClassOf(symbol) === "forex" ? isForexOpen() : true;
  }

  /** OANDA carries spot FX and nothing else. */
  supportsSymbol(symbol: string): boolean {
    return assetClassOf(symbol) === "forex" && pairSpec(symbol) !== undefined;
  }

  async sessionCloseAt(): Promise<number | null> {
    return forexSessionCloseAt();
  }

  async placeProtectiveStop(
    symbol: string,
    qty: number,
    stopPrice: number,
  ): Promise<Order | null> {
    const units = roundUnits(qty);
    if (!(units > 0) || !(stopPrice > 0)) return null;
    await this.cancelProtectiveStop(symbol);
    const spec = pairSpec(symbol);
    // Closing a long in the traded direction means selling; on an inverted
    // instrument that is a BUY at the venue, and the stop price inverts too —
    // a stop BELOW our entry in JPY/USD sits ABOVE it in USD/JPY.
    const venueStop = spec?.inverted ? 1 / stopPrice : stopPrice;
    const order: Record<string, unknown> = {
      instrument: venueSymbol(symbol),
      units: String(this.unitsFor(symbol, "sell", units)),
      type: "STOP",
      price: venueStop.toFixed(spec?.inverted ? 3 : 5),
      timeInForce: "GTC",
    };
    try {
      const res = await fetch(this.url("/orders"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ order }),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          id: "unsubmitted",
          symbol,
          side: "sell",
          qty: units,
          price: stopPrice,
          status: "rejected",
          message: data?.errorMessage || `HTTP ${res.status}`,
          createdAt: Date.now(),
        };
      }
      const id = String(data?.orderCreateTransaction?.id ?? data?.lastTransactionID ?? "unknown");
      this.stops.set(symbol, id);
      return {
        id,
        symbol,
        side: "sell",
        qty: units,
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
        qty: units,
        price: stopPrice,
        status: "rejected",
        message: `Network error: ${(err as Error).message}`,
        createdAt: Date.now(),
      };
    }
  }

  async cancelProtectiveStop(symbol: string): Promise<void> {
    const id = this.stops.get(symbol);
    if (!id) return;
    this.stops.delete(symbol);
    try {
      await fetch(this.url(`/orders/${id}/cancel`), {
        method: "PUT",
        headers: this.headers(),
      });
    } catch {
      /* best effort */
    }
  }

  hasProtectiveStop(symbol: string): boolean {
    return this.stops.has(symbol);
  }
}

/**
 * Reads OANDA credentials from the environment. Defaults to the PRACTICE
 * endpoint: getting live/practice the wrong way round is the one configuration
 * mistake here that costs real money, so the safe host is what you get unless
 * OANDA_BASE_URL says otherwise in as many words.
 */
export function readOandaCredentials(): OandaCredentials | null {
  const token = process.env.OANDA_API_TOKEN?.trim();
  const accountId = process.env.OANDA_ACCOUNT_ID?.trim();
  if (!token || !accountId) return null;
  const raw = process.env.OANDA_BASE_URL?.trim();
  const baseUrl = raw ? raw.replace(/\/+$/, "").replace(/\/v\d+$/, "") : "https://api-fxpractice.oanda.com";
  return { token, accountId, baseUrl };
}

