// Market data feed. Prefers real Alpaca crypto bars when credentials are
// present; otherwise falls back to a synthetic generator so the whole platform
// runs end-to-end with zero configuration. The synthetic series uses a random
// walk with drift and regime shifts so strategies and the backtester have
// realistic-looking data to work with out of the box.

import type { Candle } from "@shared/schema";
import { readAlpacaCredentials } from "./brokers";

const MINUTE = 60_000;

// ---------------------------------------------------------------------------
// Synthetic generator (deterministic per-run, seeded by symbol)
// ---------------------------------------------------------------------------

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate `count` one-minute candles ending at `endTime`. The walk switches
 * between trending and ranging regimes so no single strategy dominates.
 */
export function generateSyntheticCandles(
  symbol: string,
  count: number,
  endTime = Date.now(),
  startPrice = 60_000,
): Candle[] {
  const rand = mulberry32(hashSeed(symbol) ^ Math.floor(endTime / (count * MINUTE)));
  const candles: Candle[] = [];
  let price = startPrice;
  let drift = 0;
  let regimeLeft = 0;

  for (let i = 0; i < count; i++) {
    if (regimeLeft <= 0) {
      // Pick a new regime: trend up, trend down, or range.
      const r = rand();
      drift = r < 0.4 ? 0.0006 : r < 0.7 ? -0.0006 : 0;
      regimeLeft = 30 + Math.floor(rand() * 90);
    }
    regimeLeft--;

    const vol = 0.0025;
    const shock = (rand() - 0.5) * 2 * vol;
    const ret = drift + shock;
    const open = price;
    const close = Math.max(1, open * (1 + ret));
    const high = Math.max(open, close) * (1 + rand() * vol);
    const low = Math.min(open, close) * (1 - rand() * vol);
    const volume = 5 + rand() * 20;
    const time = endTime - (count - 1 - i) * MINUTE;
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

// ---------------------------------------------------------------------------
// Alpaca crypto bars
// ---------------------------------------------------------------------------

async function fetchAlpacaBars(
  symbol: string,
  count: number,
): Promise<Candle[] | null> {
  const creds = readAlpacaCredentials();
  if (!creds) return null;
  try {
    const params = new URLSearchParams({
      symbols: symbol,
      timeframe: "1Min",
      limit: String(Math.min(count, 1000)),
    });
    const url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?${params}`;
    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secretKey,
      },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const bars: any[] = data?.bars?.[symbol] ?? [];
    if (!bars.length) return null;
    return bars.map((b) => ({
      time: new Date(b.t).getTime(),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public feed
// ---------------------------------------------------------------------------

export interface MarketFeed {
  readonly source: "alpaca" | "synthetic";
  /** Latest `count` candles for the symbol, oldest first. */
  getCandles(symbol: string, count: number): Promise<Candle[]>;
  /** Convenience: most recent close price. */
  getPrice(symbol: string): Promise<number>;
}

export function createMarketFeed(): MarketFeed {
  const hasKeys = readAlpacaCredentials() !== null;
  return {
    source: hasKeys ? "alpaca" : "synthetic",
    async getCandles(symbol, count) {
      const real = await fetchAlpacaBars(symbol, count);
      if (real && real.length) return real;
      return generateSyntheticCandles(symbol, count);
    },
    async getPrice(symbol) {
      const candles = await this.getCandles(symbol, 2);
      return candles[candles.length - 1].close;
    },
  };
}
