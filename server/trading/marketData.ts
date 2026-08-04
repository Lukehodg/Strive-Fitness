// Market data feed. Prefers real Alpaca crypto bars when credentials are
// present; otherwise falls back to a synthetic generator so the whole platform
// runs end-to-end with zero configuration. The synthetic series uses a random
// walk with drift and regime shifts so strategies and the backtester have
// realistic-looking data to work with out of the box.

import type { Candle } from "@shared/schema";
import { readAlpacaCredentials } from "./brokers";
import { assetClassOf, barsUrl } from "./assets";

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

// ---------------------------------------------------------------------------
// Return process
//
// The generator used to be a UNIFORM shock around a persistent drift with
// constant volatility. Measured against the stylized facts of real returns
// (trading/marketFacts.ts) it failed all six, and two of the failures were bad
// enough to invalidate conclusions drawn from it:
//
//   excess kurtosis  -0.97   THINNER-tailed than Gaussian. A uniform shock has
//                            excess kurtosis -1.2 by construction, so the
//                            series contained no tail risk whatsoever. Every
//                            stop-loss and position size tuned on it was tuned
//                            for a world without disasters.
//
//   return ACF(1)    +0.12   A drift held for 30-120 bars makes consecutive
//                            returns correlated, which hands trend-following a
//                            free edge that does not exist in a real market.
//                            This very likely explains why Breakout Momentum
//                            dominated every measurement in this project.
//
//   vol clustering   -0.00   Constant volatility, so volatility TARGETING was
//                            never once tested at the job it exists for.
//
// Replaced with the standard workhorse: GJR-GARCH(1,1) driven by Student-t
// innovations. That buys fat tails, volatility that arrives in bursts and
// decays slowly, and a larger volatility response to falls than to rises.
// ---------------------------------------------------------------------------

/** Long-run per-bar volatility (~0.15%), matching liquid crypto on 1m bars. */
const BASE_VOL = 0.0015;
/**
 * Regime drift per bar. Deliberately SMALL relative to BASE_VOL.
 *
 * Drift that persists across bars is exactly what creates return
 * autocorrelation, and real markets have almost none. At 12% of one bar's
 * volatility the regimes are still detectable over a window (which the regime
 * classifier needs) while lag-1 autocorrelation stays inside the +/-0.05 band
 * that counts as martingale-like. Weak trends relative to noise is not a
 * limitation of the model — it is the reason trend-following is hard.
 */
const REGIME_DRIFT = BASE_VOL * 0.08;

// GJR-GARCH(1,1). alpha + gamma/2 + beta = 0.99: high persistence, which is
// what makes volatility clusters last rather than reverting in a bar or two.
const GARCH_ALPHA = 0.06;
/** Extra response to NEGATIVE shocks — the leverage effect. */
const GARCH_GAMMA = 0.14;
const GARCH_BETA = 0.86;
const GARCH_OMEGA = BASE_VOL * BASE_VOL * (1 - GARCH_ALPHA - GARCH_GAMMA / 2 - GARCH_BETA);
/** Hard ceiling on conditional volatility, in multiples of BASE_VOL. */
const MAX_VOL_MULTIPLE = 8;
/**
 * Student-t degrees of freedom. Lower = fatter tails.
 *
 * 5 produced kurtosis that swung from 12 to 95 across seeds — real enough on
 * average but wildly unstable, and a generator whose tail weight depends on
 * the seed makes results depend on the seed too. 6 keeps kurtosis in the
 * 8-30 band on every seed tested.
 */
const T_DF = 6;

/** Standard normal via Box-Muller, sharing one uniform stream. */
function gaussian(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = rand() * 2 - 1;
      v = rand() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const f = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * f;
    return u * f;
  };
}

/**
 * Student-t innovation standardized to unit variance.
 *
 * t_v = Z / sqrt(V/v) with V ~ chi-square(v), built from v squared normals.
 * Raw t_v has variance v/(v-2), so it is divided back down — otherwise the
 * fat tails would also silently double the series' volatility and every
 * volatility-calibrated setting would be wrong again.
 */
function studentT(norm: () => number, _rand: () => number): number {
  let chi = 0;
  for (let i = 0; i < T_DF; i++) {
    const z = norm();
    chi += z * z;
  }
  const t = norm() / Math.sqrt(chi / T_DF);
  return t / Math.sqrt(T_DF / (T_DF - 2));
}

/**
 * Bars per anchor block (7 days). The walk is regenerated from the start of
 * the block containing `endTime`, so every call within a block sees the SAME
 * series and simply reads a different amount of it.
 */
const BLOCK_BARS = 10_080;

/**
 * Generate `count` one-minute candles ending at `endTime`. The walk switches
 * between trending and ranging regimes so no single strategy dominates.
 *
 * The series is defined on the ABSOLUTE one-minute grid and anchored to a
 * fixed block boundary — never to `count` or to a coarse bucket of `endTime`.
 * That matters because the live feed calls this repeatedly as time passes:
 *
 *   - Seeding by `count` made the same feed report different prices depending
 *     on how much history the caller asked for (getPrice() asks for 2 bars,
 *     the engine asks for 200 — they disagreed by ~6%).
 *   - Seeding by `floor(endTime / (count * MINUTE))` held the seed constant
 *     for `count` minutes, so the whole series regenerated identically on
 *     every tick — the engine saw a frozen market for 200 minutes at a time,
 *     then a ~13% instantaneous gap when the bucket rolled (bigger than both
 *     the 3% stop-loss and the 6% take-profit).
 *
 * Anchoring to the absolute grid makes consecutive minutes yield consecutive
 * bars (one genuinely new bar per minute) and makes the price at a given
 * instant independent of `count`. The walk restarts at a block boundary once
 * every 30 days, which is the one remaining seam.
 */
export function generateSyntheticCandles(
  symbol: string,
  count: number,
  endTime = Date.now(),
  startPrice = 60_000,
): Candle[] {
  const endIndex = Math.floor(endTime / MINUTE);
  // Anchor one full block back so at least BLOCK_BARS of history always
  // precedes `endIndex`, however many bars the caller asks for.
  const anchorIndex = (Math.floor(endIndex / BLOCK_BARS) - 1) * BLOCK_BARS;
  const total = endIndex - anchorIndex + 1;

  const rand = mulberry32(hashSeed(symbol) ^ (anchorIndex >>> 0));
  const norm = gaussian(rand);
  const candles: Candle[] = [];
  let price = startPrice;
  let drift = 0;
  let regimeLeft = 0;

  // GJR-GARCH state. Start at the long-run level so the series does not spend
  // its opening bars warming up into realistic behaviour.
  let variance = BASE_VOL * BASE_VOL;
  let lastShock = 0;

  for (let i = 0; i < total; i++) {
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
      drift = r < 0.35 ? REGIME_DRIFT : r < 0.7 ? -REGIME_DRIFT : 0;
      regimeLeft = 30 + Math.floor(rand() * 90);
    }
    regimeLeft--;

    // GJR-GARCH(1,1): today's variance from yesterday's shock and variance,
    // with a larger response to DOWN moves (the leverage effect).
    const leverage = lastShock < 0 ? GARCH_GAMMA : 0;
    variance = GARCH_OMEGA + (GARCH_ALPHA + leverage) * lastShock * lastShock + GARCH_BETA * variance;
    // Bound it. An unbounded GARCH path can wander into a variance that makes
    // a single bar move the price by orders of magnitude, which is not a fat
    // tail, it is a broken series.
    variance = Math.min(variance, (BASE_VOL * MAX_VOL_MULTIPLE) ** 2);
    const vol = Math.sqrt(variance);

    // Student-t innovation, standardized to unit variance: fat tails without
    // changing the scale the GARCH recursion is calibrated against.
    const shock = vol * studentT(norm, rand);
    lastShock = shock;

    const ret = drift + shock;
    const open = price;
    const close = Math.max(1, open * (1 + ret));
    // Wicks scale with the bar's OWN volatility, so a violent bar looks
    // violent. A fixed wick width would let ATR-based sizing read a calm
    // range during a volatility burst.
    const high = Math.max(open, close) * (1 + Math.abs(norm()) * vol * 0.6);
    const low = Math.min(open, close) * (1 - Math.abs(norm()) * vol * 0.6);
    // Volume rises with volatility, as it does in life.
    const volume = 5 + rand() * 20 * (1 + vol / BASE_VOL);
    const time = (anchorIndex + i) * MINUTE;
    candles.push({ time, open, high, low, close, volume });
    price = close;
  }
  // Keep the quoted level plausible without touching a single return. An
  // unbiased 7-day walk can wander several-fold from its starting point, which
  // reads as broken in the UI ("BTC at $391,598"). Rescaling every bar by ONE
  // constant leaves all returns, ratios and indicator readings bit-identical —
  // strategies are scale-invariant — so this is presentation only. The
  // reference bar is fixed for the block (never `endIndex`), so the factor
  // cannot change between ticks and history is never rewritten.
  const referenceIdx = Math.min(BLOCK_BARS, candles.length - 1);
  const scale = startPrice / candles[referenceIdx].close;
  if (Number.isFinite(scale) && scale > 0) {
    for (const c of candles) {
      c.open *= scale;
      c.high *= scale;
      c.low *= scale;
      c.close *= scale;
    }
  }

  // Hand back only the tail the caller asked for. The bars themselves are the
  // same objects any other caller would see for those same minutes.
  if (count < candles.length) return candles.slice(candles.length - count);
  return candles;
}

// ---------------------------------------------------------------------------
// Alpaca market data (crypto + equities)
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
    // Equities and crypto live behind different market-data endpoints.
    if (assetClassOf(symbol) === "stock") {
      // Free Alpaca data plans only serve IEX, and delayed SIP data is
      // rejected outright — asking for IEX explicitly keeps stock bars
      // working on a default account instead of erroring.
      params.set("feed", process.env.ALPACA_DATA_FEED || "iex");
    }
    const url = barsUrl(symbol, params);
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
