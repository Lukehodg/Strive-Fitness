// Real historical market-data downloader.
//
// To train a model that's actually seen the market, we need real history — not
// the synthetic feed. This pulls years of OHLCV candles from free public APIs
// (no key required) and caches them to disk so you download once and reuse.
//
// Sources, in preference order:
//   1. Binance   — https://api.binance.com/api/v3/klines (1000 bars/call)
//   2. CryptoCompare — histohour/histoday (2000 bars/call)
// Both are free and keyless. If your network blocks one, the loader falls back.

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import type { Candle } from "@shared/schema";

const DATA_DIR = join(process.cwd(), "data");
/** Reuse a cached download if it's newer than this (ms). */
const CACHE_TTL = 24 * 60 * 60 * 1000;

export type Interval = "1h" | "4h" | "1d";

export interface HistorySource {
  source: "binance" | "cryptocompare" | "cache";
  symbol: string;
  interval: Interval;
  candles: Candle[];
}

const INTERVAL_MS: Record<Interval, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

/** Split a "BTC/USD"-style symbol into base and quote. */
function splitSymbol(symbol: string): { base: string; quote: string } {
  const [base, quote] = symbol.toUpperCase().split("/");
  return { base: base || "BTC", quote: quote || "USD" };
}

// ---------------------------------------------------------------------------
// Binance
// ---------------------------------------------------------------------------

function binancePair(symbol: string): string {
  const { base, quote } = splitSymbol(symbol);
  // Binance quotes crypto in USDT rather than USD.
  return `${base}${quote === "USD" ? "USDT" : quote}`;
}

async function fetchBinance(
  symbol: string,
  interval: Interval,
  bars: number,
): Promise<Candle[]> {
  const pair = binancePair(symbol);
  const out: Candle[] = [];
  let endTime = Date.now();
  while (out.length < bars) {
    const limit = Math.min(1000, bars - out.length);
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${pair}` +
      `&interval=${interval}&limit=${limit}&endTime=${endTime}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
    const rows = (await res.json()) as unknown[][];
    if (!rows.length) break;
    const chunk: Candle[] = rows.map((r) => ({
      time: Number(r[0]),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    }));
    out.unshift(...chunk);
    endTime = chunk[0].time - 1; // step back before the earliest bar
    if (chunk.length < limit) break; // no more history
  }
  return dedupeSorted(out);
}

// ---------------------------------------------------------------------------
// CryptoCompare
// ---------------------------------------------------------------------------

async function fetchCryptoCompare(
  symbol: string,
  interval: Interval,
  bars: number,
): Promise<Candle[]> {
  const { base, quote } = splitSymbol(symbol);
  const endpoint = interval === "1d" ? "histoday" : "histohour";
  const aggregate = interval === "4h" ? 4 : 1;
  const out: Candle[] = [];
  let toTs = Math.floor(Date.now() / 1000);
  while (out.length < bars) {
    const limit = Math.min(2000, bars - out.length);
    const url =
      `https://min-api.cryptocompare.com/data/v2/${endpoint}` +
      `?fsym=${base}&tsym=${quote}&limit=${limit}&aggregate=${aggregate}&toTs=${toTs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CryptoCompare HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const rows: any[] = body?.Data?.Data ?? [];
    if (!rows.length) break;
    const chunk: Candle[] = rows
      .filter((r) => r.close > 0)
      .map((r) => ({
        time: r.time * 1000,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volumefrom ?? 0,
      }));
    out.unshift(...chunk);
    toTs = rows[0].time - 1;
    if (rows.length < limit) break;
  }
  return dedupeSorted(out);
}

// ---------------------------------------------------------------------------
// Cache + public API
// ---------------------------------------------------------------------------

function cachePath(symbol: string, interval: Interval): string {
  const safe = symbol.replace(/[^A-Za-z0-9]/g, "");
  return join(DATA_DIR, `history-${safe}-${interval}.json`);
}

function dedupeSorted(candles: Candle[]): Candle[] {
  const map = new Map<number, Candle>();
  for (const c of candles) map.set(c.time, c);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

/**
 * Load historical candles, preferring a fresh on-disk cache. Downloads from a
 * public API otherwise (Binance, then CryptoCompare). Set `refresh` to force a
 * re-download.
 */
export async function loadHistory(
  symbol: string,
  interval: Interval = "1h",
  bars = 17_520, // ~2 years of hourly bars
  refresh = false,
): Promise<HistorySource> {
  const path = cachePath(symbol, interval);
  if (!refresh && existsSync(path)) {
    const age = Date.now() - statSync(path).mtimeMs;
    if (age < CACHE_TTL) {
      const candles = JSON.parse(readFileSync(path, "utf-8")) as Candle[];
      if (candles.length) return { source: "cache", symbol, interval, candles };
    }
  }

  let candles: Candle[] = [];
  let source: HistorySource["source"] = "binance";
  const errors: string[] = [];
  try {
    candles = await fetchBinance(symbol, interval, bars);
  } catch (e) {
    errors.push(`binance: ${(e as Error).message}`);
  }
  if (candles.length < bars * 0.5) {
    try {
      const cc = await fetchCryptoCompare(symbol, interval, bars);
      if (cc.length > candles.length) {
        candles = cc;
        source = "cryptocompare";
      }
    } catch (e) {
      errors.push(`cryptocompare: ${(e as Error).message}`);
    }
  }

  if (!candles.length) {
    throw new Error(
      `Could not download market data. ${errors.join("; ")}. ` +
        `Check your network allows api.binance.com or min-api.cryptocompare.com.`,
    );
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(candles));
  return { source, symbol, interval, candles };
}

export { INTERVAL_MS };
