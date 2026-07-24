// Broker abstraction. The engine only ever talks to the `Broker` interface, so
// swapping paper trading for a real account is a matter of which implementation
// is instantiated — nothing else in the system changes.

import { randomUUID } from "crypto";
import type { Order, OrderRequest, Position } from "@shared/schema";

export interface AccountSnapshot {
  cash: number;
  /** Marked-to-market value of all open positions. */
  positionsValue: number;
  /** cash + positionsValue. */
  equity: number;
}

export interface Broker {
  readonly kind: "paper" | "alpaca";
  /** Submit an order. Resolves with the resulting fill (or a rejection). */
  submitOrder(req: OrderRequest, markPrice: number): Promise<Order>;
  /** Current open position for a symbol, or null if flat. */
  getPosition(symbol: string): Promise<Position | null>;
  /** Account cash/equity. `markPrice` marks any open position. */
  getAccount(markPrice: number): Promise<AccountSnapshot>;
  /** Update the mark price used for unrealized P&L. */
  mark(symbol: string, price: number): void;
}

// ---------------------------------------------------------------------------
// PaperBroker — fully in-memory simulated fills. No credentials, no network.
// ---------------------------------------------------------------------------

export class PaperBroker implements Broker {
  readonly kind = "paper" as const;
  private cash: number;
  private positions = new Map<string, Position>();
  /** Fraction charged per fill to approximate spread + fees. */
  private readonly feeRate = 0.001;

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

    const notional = req.qty * markPrice;
    const fee = notional * this.feeRate;

    if (req.side === "buy") {
      if (notional + fee > this.cash + 1e-9) {
        return { ...base, status: "rejected", message: "Insufficient cash" };
      }
      this.cash -= notional + fee;
      const existing = this.positions.get(req.symbol);
      if (existing) {
        const totalQty = existing.qty + req.qty;
        existing.avgEntryPrice =
          (existing.avgEntryPrice * existing.qty + markPrice * req.qty) /
          totalQty;
        existing.qty = totalQty;
        existing.markPrice = markPrice;
      } else {
        this.positions.set(req.symbol, {
          symbol: req.symbol,
          qty: req.qty,
          avgEntryPrice: markPrice,
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

    return { ...base, status: "filled" };
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
