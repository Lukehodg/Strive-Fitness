// Broker abstraction. The engine only ever talks to the `Broker` interface, so
// swapping paper trading for a real account is a matter of which implementation
// is instantiated — nothing else in the system changes.

import { randomUUID } from "crypto";
import type { Order, OrderRequest, Position } from "@shared/schema";
import {
  limitPriceFor,
  MAKER_FEE_RATE,
  TAKER_FEE_RATE,
  TAKER_SLIPPAGE_RATE,
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
  /** Account cash/equity. `markPrice` marks any open position. */
  getAccount(markPrice: number): Promise<AccountSnapshot>;
  /** Update the mark price used for unrealized P&L. */
  mark(symbol: string, price: number): void;
  /**
   * Settle any resting limit orders against the bar that has just elapsed.
   * Only simulated brokers need this — a real venue manages its own book.
   */
  resolvePending?(
    restingBar: { high: number; low: number },
    markPrice: number,
  ): Order[];
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
      } else if (req.qty * limitPrice * (1 + MAKER_FEE_RATE) > this.cash + 1e-9) {
        return { ...base, status: "rejected", message: "Insufficient cash" };
      }
      const pending: Order = { ...base, status: "pending", price: limitPrice };
      this.resting.push({ base: pending, req, limitPrice, isExit });
      return pending;
    }

    // Market / forced-taker order: fills immediately at the reference price.
    return this.settle(base, req, markPrice * (req.side === "buy" ? 1 + TAKER_SLIPPAGE_RATE : 1 - TAKER_SLIPPAGE_RATE), TAKER_FEE_RATE, "taker", markPrice);
  }

  /**
   * Settle resting orders against the bar that has now elapsed. Touched
   * limits fill as makers; an untouched EXIT falls back to a taker fill
   * (an exit that never happens is a risk failure, not a saving), while an
   * untouched ENTRY is simply cancelled and the strategy re-evaluates.
   */
  resolvePending(
    restingBar: { high: number; low: number },
    markPrice: number,
  ): Order[] {
    if (!this.resting.length) return [];
    const queue = this.resting;
    this.resting = [];
    const out: Order[] = [];

    for (const r of queue) {
      const touched =
        r.req.side === "buy" ? restingBar.low <= r.limitPrice : restingBar.high >= r.limitPrice;
      if (touched) {
        out.push(this.settle(r.base, r.req, r.limitPrice, MAKER_FEE_RATE, "maker", markPrice));
      } else if (r.isExit) {
        const takerPrice = markPrice * (1 - TAKER_SLIPPAGE_RATE);
        out.push(this.settle(r.base, r.req, takerPrice, TAKER_FEE_RATE, "taker", markPrice));
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

  async getAccount(markPrice: number): Promise<AccountSnapshot> {
    let positionsValue = 0;
    for (const p of Array.from(this.positions.values())) {
      positionsValue += p.qty * markPrice;
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

export class AlpacaBroker implements Broker {
  readonly kind = "alpaca" as const;
  private lastMark = new Map<string, number>();

  constructor(private creds: AlpacaCredentials) {}

  private headers() {
    return {
      "APCA-API-KEY-ID": this.creds.keyId,
      "APCA-API-SECRET-KEY": this.creds.secretKey,
      "Content-Type": "application/json",
    };
  }

  async submitOrder(req: OrderRequest, markPrice: number): Promise<Order> {
    const body = {
      symbol: req.symbol,
      qty: req.qty,
      side: req.side,
      type: "market",
      time_in_force: "gtc",
    };
    const res = await fetch(`${this.creds.baseUrl}/v2/orders`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    const order: Order = {
      id: data.id ?? "unknown",
      symbol: req.symbol,
      side: req.side,
      qty: req.qty,
      price: Number(data.filled_avg_price) || markPrice,
      status: res.ok ? "filled" : "rejected",
      reason: req.reason,
      message: res.ok ? undefined : data.message || `HTTP ${res.status}`,
      createdAt: Date.now(),
    };
    return order;
  }

  async getPosition(symbol: string): Promise<Position | null> {
    // Alpaca uses symbols without a slash for positions (e.g. BTCUSD).
    const sym = symbol.replace("/", "");
    const res = await fetch(`${this.creds.baseUrl}/v2/positions/${sym}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const p: any = await res.json();
    const qty = Number(p.qty);
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
  }

  async getAccount(markPrice: number): Promise<AccountSnapshot> {
    const res = await fetch(`${this.creds.baseUrl}/v2/account`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      return { cash: 0, positionsValue: 0, equity: 0 };
    }
    const a: any = await res.json();
    const cash = Number(a.cash) || 0;
    const equity = Number(a.equity) || cash;
    return { cash, positionsValue: equity - cash, equity };
  }

  mark(symbol: string, price: number): void {
    this.lastMark.set(symbol, price);
  }
}

/**
 * Reads Alpaca credentials from the environment. Returns null when live
 * trading isn't configured, which keeps the platform in paper mode.
 */
export function readAlpacaCredentials(): AlpacaCredentials | null {
  const keyId = process.env.ALPACA_KEY_ID;
  const secretKey = process.env.ALPACA_SECRET_KEY;
  if (!keyId || !secretKey) return null;
  const baseUrl =
    process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets";
  return { keyId, secretKey, baseUrl };
}
