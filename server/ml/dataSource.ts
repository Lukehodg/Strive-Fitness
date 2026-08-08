// Real historical market-data downloader.
//
// To train a model that has actually seen the market, we need real history —
// not the synthetic feed. This pulls years of OHLCV candles from OANDA and
// caches them to disk so you download once and reuse.
//
// CHANGED WITH THE MOVE TO FX. This used to pull from Binance and
// CryptoCompare, which are free and keyless but serve crypto only. OANDA is
// the platform's single venue now, so history comes from the same place the
// live prices do — which is the right property for training data to have: a
// model trained on one vendor's bars and traded against another's is learning
// the difference between them as well as the market.
//
// The cost is that training now REQUIRES CREDENTIALS. There is no keyless
// fallback for FX, so `npm run train` fails with an explicit message rather
// than quietly training on something else.
//
// Two FX-specific properties matter here:
//
//   - NO WEEKEND BARS. FX runs 24/5, so an hourly year is ~6,240 bars, not
//     8,760. Asking for "2 years" and receiving 30% fewer bars than a crypto
//     symbol would is correct, not a truncated download.
//   - QUOTE DIRECTION. OANDA serves USD_JPY; we trade JPY/USD. Candles are
//     inverted here, at the same boundary the live feed inverts them.

import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import type { Candle } from "@shared/schema";
import { readOandaCredentials } from "../trading/brokers";
import { venueSymbol } from "../trading/assets";
import { pairSpec, tradeablePairs } from "../trading/forex";

const DATA_DIR = join(process.cwd(), "data");
/** Reuse a cached download if it's newer than this (ms). */
const CACHE_TTL = 24 * 60 * 60 * 1000;

export type Interval = "1h" | "4h" | "1d";

export interface HistorySource {
  source: "oanda" | "cache";
  symbol: string;
  interval: Interval;
  candles: Candle[];
}

const INTERVAL_MS: Record<Interval, number> = {
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

// ---------------------------------------------------------------------------
// OANDA history
// ---------------------------------------------------------------------------

const GRANULARITY: Record<Interval, string> = { "1h": "H1", "4h": "H4", "1d": "D" };
/** v20 caps a single candles request at 5000. */
const MAX_PER_CALL = 5000;

/**
 * Invert a candle. High and low SWAP as well as reciprocating: the highest
 * USD/JPY of a bar is the LOWEST JPY/USD of that same bar. Getting this
 * backwards produces bars whose low exceeds their high, which then flows into
 * every feature and label built from them.
 */
function invert(c: Candle): Candle {
  return {
    time: c.time,
    open: 1 / c.open,
    high: 1 / c.low,
    low: 1 / c.high,
    close: 1 / c.close,
    volume: c.volume,
  };
}

async function fetchOanda(
  symbol: string,
  interval: Interval,
  bars: number,
): Promise<Candle[]> {
  const creds = readOandaCredentials();
  if (!creds) {
    throw new Error(
      "OANDA credentials required for historical data. Set OANDA_API_TOKEN and " +
        "OANDA_ACCOUNT_ID in .env (see .env.example). There is no keyless FX feed.",
    );
  }
  const spec = pairSpec(symbol);
  if (!spec) {
    throw new Error(
      `${symbol} is not a tradeable FX pair. Use one of: ${tradeablePairs().join(", ")}`,
    );
  }

  const out: Candle[] = [];
  // Page BACKWARDS from now. Walking forward would need a start date we do not
  // have, and the natural request ("the most recent N bars") is exactly what
  // `to` + `count` expresses.
  let to = new Date();
  while (out.length < bars) {
    const want = Math.min(MAX_PER_CALL, bars - out.length);
    const params = new URLSearchParams({
      granularity: GRANULARITY[interval],
      count: String(want),
      // Mid prices: the cost model charges the spread explicitly, so taking
      // bid or ask candles would bake half of it into the series AND charge it
      // again downstream.
      price: "M",
      to: to.toISOString(),
    });
    const url = `${creds.baseUrl}/v3/instruments/${venueSymbol(symbol)}/candles?${params}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.token}` } });
    if (!res.ok) {
      throw new Error(`OANDA candles ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data: any = await res.json();
    const page: Candle[] = (data?.candles ?? [])
      .filter((c: any) => c.complete && c.mid)
      .map((c: any) => ({
        time: new Date(c.time).getTime(),
        open: Number(c.mid.o),
        high: Number(c.mid.h),
        low: Number(c.mid.l),
        close: Number(c.mid.c),
        volume: Number(c.volume) || 0,
      }))
      .filter((c: Candle) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);

    if (!page.length) break; // no more history available
    out.push(...page);
    // Next page ends where this one began. Step back one bar so the boundary
    // candle is not requested twice (dedupeSorted would drop it anyway, but a
    // repeated page would loop forever if the venue kept returning it).
    to = new Date(page[0].time - 1);
    if (page.length < want) break; // venue ran out of history
  }

  const sorted = dedupeSorted(out);
  return spec.inverted ? sorted.map(invert) : sorted;
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
 * OANDA otherwise. Set `refresh` to force a re-download.
 */
export async function loadHistory(
  symbol: string,
  interval: Interval = "1h",
  // ~2 years of hourly FX bars. Lower than a crypto equivalent on purpose:
  // FX has no weekend session, so a year is about 6,240 hourly bars.
  bars = 12_480,
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
  try {
    candles = await fetchOanda(symbol, interval, bars);
  } catch (e) {
    throw new Error(`Could not download ${symbol} history: ${(e as Error).message}`);
  }

  if (!candles.length) {
    throw new Error(
      `OANDA returned no candles for ${symbol}. Check the pair is enabled on ` +
        `your account and that OANDA_BASE_URL matches the account type ` +
        `(practice tokens do not work against the live host, or vice versa).`,
    );
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(candles));
  return { source: "oanda", symbol, interval, candles };
}

export { INTERVAL_MS };
