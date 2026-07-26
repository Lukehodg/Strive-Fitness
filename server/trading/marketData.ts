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
      //
      // Up and down MUST be equally likely. An asymmetry here injects a net
      // upward drift that compounds silently and makes every strategy look
      // profitable for no reason other than a rigged uptrend: the previous
      // 40%/30%/30% split gave +0.006%/bar, which is only ~+3% over a 500-bar
      // backtest window (easy to miss) but ~+1236% over a month of 1-minute
      // bars. Keep the flat-regime share at 30% and split the rest evenly.
      const r = rand();
      drift = r < 0.35 ? 0.0006 : r < 0.7 ? -0.0006 : 0;
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

/**
 * Module-level (not per-feed-instance) cache: the engine, the improver, and
 * API routes each call `createMarketFeed()` separately, so a cache living on
 * the returned object would never dedupe across them. Keyed by
 * `${symbol}:${count}`; caches the in-flight promise (not just the resolved
 * value) so concurrent callers within the same tick share one Alpaca
 * request/synthetic generation instead of firing one each.
 *
 * TTL is shorter than the engine's minimum tick interval (5s, enforced in
 * engine.ts) so the cache can never delay the live engine's reaction to
 * genuinely fresh data — it only dedupes near-simultaneous calls (e.g. a
 * dashboard poll landing in the same second as an engine tick).
 */
const CACHE_TTL_MS = 3_000;
const candleCache = new Map<string, { expires: number; promise: Promise<Candle[]> }>();

export function createMarketFeed(): MarketFeed {
  const hasKeys = readAlpacaCredentials() !== null;
  return {
    source: hasKeys ? "alpaca" : "synthetic",
    async getCandles(symbol, count) {
      const key = `${symbol}:${count}`;
      const now = Date.now();
      const cached = candleCache.get(key);
      if (cached && cached.expires > now) return cached.promise;

      const promise = (async () => {
        const real = await fetchAlpacaBars(symbol, count);
        if (real && real.length) return real;
        return generateSyntheticCandles(symbol, count);
      })();
      candleCache.set(key, { expires: now + CACHE_TTL_MS, promise });
      // Don't cache a rejected fetch — let the next call retry immediately.
      promise.catch(() => candleCache.delete(key));
      return promise;
    },
    async getPrice(symbol) {
      const candles = await this.getCandles(symbol, 2);
      return candles[candles.length - 1].close;
    },
  };
}
