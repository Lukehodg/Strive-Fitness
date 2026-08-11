// Kronos (vendor/kronos, served by kronos_sidecar/) runs as a separate
// Python process — a pretrained Transformer has no place inside a
// synchronous, per-bar TypeScript strategy evaluate() call, and even a fast
// inference is too slow to run on every 5-30s engine tick. This client
// therefore never calls the sidecar from evaluate() itself: a background
// refresh (triggered from the engine's tick loop, at most once per
// `refreshMinutes`) fetches a forecast asynchronously and caches it;
// evaluate() only ever does a synchronous cache read — the exact same shape
// as signalModel's isTradable()/predictWithMeta(). If the sidecar is
// unreachable, unconfigured, or a forecast is stale/missing, the caller
// falls back to hold, the same fail-safe every other model-backed strategy
// in this project uses when its evidence isn't there.

import type { Candle } from "@shared/schema";

export interface KronosForecastCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface KronosForecast {
  fetchedAt: number;
  /** Time of the last input candle the forecast was built from. */
  asOf: number;
  forecast: KronosForecastCandle[];
}

export interface KronosClientConfig {
  enabled: boolean;
  sidecarUrl: string;
  /** How many recent candles to send as context. Kronos-small/base cap at 512. */
  lookback: number;
  /** How many future bars to forecast. */
  predLen: number;
  intervalMinutes: number;
  /** Minimum time between refreshes for the same symbol. */
  refreshMinutes: number;
  /** Stochastic samples the sidecar averages server-side to smooth noise. */
  sampleCount: number;
}

export const DEFAULT_KRONOS_CONFIG: KronosClientConfig = {
  enabled: false,
  sidecarUrl: "http://127.0.0.1:8787",
  lookback: 400,
  predLen: 12,
  intervalMinutes: 60,
  // Just under one hourly bar, so a fresh forecast is ready by the next
  // candle close without re-requesting on every single tick in between.
  refreshMinutes: 55,
  sampleCount: 3,
};

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

class KronosClient {
  private config: KronosClientConfig = DEFAULT_KRONOS_CONFIG;
  private cache = new Map<string, KronosForecast>();
  private inFlight = new Set<string>();
  private lastAttempt = new Map<string, number>();
  private reachable: boolean | null = null;

  configure(config: Partial<KronosClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isReachable(): boolean | null {
    return this.reachable;
  }

  /** Synchronous cache read — the only thing a strategy's evaluate() may call. */
  getCached(symbol: string): KronosForecast | null {
    return this.cache.get(symbol) ?? null;
  }

  /**
   * Fire-and-forget: starts a background refresh for `symbol` if enough time
   * has passed since the last attempt and one isn't already in flight. Never
   * throws and never blocks the caller — safe to call unconditionally from
   * the engine's tick loop every tick; the internal throttling keeps it cheap.
   */
  maybeRefresh(symbol: string, candles: Candle[]): void {
    if (!this.config.enabled) return;
    if (this.inFlight.has(symbol)) return;
    if (candles.length < 30) return; // not enough history to bother asking
    const last = this.lastAttempt.get(symbol) ?? 0;
    if (Date.now() - last < this.config.refreshMinutes * 60_000) return;

    this.lastAttempt.set(symbol, Date.now());
    this.inFlight.add(symbol);
    this.refresh(symbol, candles)
      .catch(() => {
        // Expected on a down/unconfigured sidecar. getCached() returning
        // stale-or-null data is the signal; callers fall back to hold. There
        // is nothing more to do here than avoid an unhandled rejection.
      })
      .finally(() => this.inFlight.delete(symbol));
  }

  private async refresh(symbol: string, candles: Candle[]): Promise<void> {
    const window = candles.slice(-this.config.lookback);
    const body = {
      candles: window.map((c) => ({
        time: new Date(c.time).toISOString(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
      intervalMinutes: this.config.intervalMinutes,
      predLen: this.config.predLen,
      sampleCount: this.config.sampleCount,
    };
    const { signal, cancel } = withTimeout(30_000);
    try {
      const res = await fetch(`${this.config.sidecarUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        this.reachable = true; // it answered — just rejected this particular request
        throw new Error(`Kronos sidecar ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as { forecast: Array<Record<string, unknown>> };
      this.reachable = true;
      this.cache.set(symbol, {
        fetchedAt: Date.now(),
        asOf: window[window.length - 1].time,
        forecast: data.forecast.map((f) => ({
          time: new Date(f.time as string).getTime(),
          open: Number(f.open),
          high: Number(f.high),
          low: Number(f.low),
          close: Number(f.close),
          volume: Number(f.volume ?? 0),
        })),
      });
    } catch (err) {
      this.reachable = false;
      throw err;
    } finally {
      cancel();
    }
  }

  async health(): Promise<{ ok: boolean; modelSize?: string; stub?: boolean }> {
    const { signal, cancel } = withTimeout(5_000);
    try {
      const res = await fetch(`${this.config.sidecarUrl}/health`, { signal });
      if (!res.ok) {
        this.reachable = false;
        return { ok: false };
      }
      const data = (await res.json()) as { modelSize: string; stub: boolean };
      this.reachable = true;
      return { ok: true, modelSize: data.modelSize, stub: data.stub };
    } catch {
      this.reachable = false;
      return { ok: false };
    } finally {
      cancel();
    }
  }
}

export const kronosClient = new KronosClient();
