// Worker body: evaluates ONE walk-forward path for ONE selection policy.
//
// Each message is a fully self-describing job — a seed and a settings object,
// not a shared handle — because worker threads do not share memory and a job
// that depends on parent state silently evaluates the wrong thing.

import { parentPort } from "worker_threads";
import { STRATEGY_LIST, type Strategy } from "./strategies";
import { backtestStrategy } from "./backtester";
import { selectStrategy } from "./aiSelector";
import { generateSyntheticCandles } from "./marketData";
import { setCostOverrides } from "./costs";
import type { Candle } from "@shared/schema";

export interface PathJob {
  /** Symbol seed, so each worker regenerates the identical series. */
  seed: string;
  anchorMs: number;
  bars: number;
  lookback: number;
  horizon: number;
  /** Selector hysteresis to test, or null to hold `fixedStrategyId` throughout. */
  margin: number | null;
  fixedStrategyId?: string;
}

export interface PathResult {
  total: number;
  switches: number;
}

const WARM = 240;
const TRADABLE_START = 35;

function forwardReturn(strategy: Strategy, candles: Candle[], start: number, end: number): number {
  const from = Math.max(0, start - WARM);
  const returns = backtestStrategy(strategy, candles.slice(from, end)).returns ?? [];
  const offset = start - from - TRADABLE_START;
  if (offset < 0 || offset >= returns.length) return 0;
  let mult = 1;
  for (let i = offset; i < returns.length; i++) mult *= 1 + returns[i];
  return mult - 1;
}

export function run(job: PathJob): PathResult {
  setCostOverrides({}); // corrected defaults, same in every worker
  const candles = generateSyntheticCandles(job.seed, job.bars, job.anchorMs);
  const fixed = job.fixedStrategyId
    ? STRATEGY_LIST.find((s) => s.meta.id === job.fixedStrategyId)
    : undefined;

  let equity = 1;
  let current: string | undefined;
  let switches = 0;

  for (let t = job.lookback; t + job.horizon <= candles.length; t += job.horizon) {
    const chosen =
      fixed ?? selectStrategy(candles.slice(t - job.lookback, t), current, job.margin ?? undefined).chosen;
    if (current && chosen.meta.id !== current) switches++;
    current = chosen.meta.id;
    equity *= 1 + forwardReturn(chosen, candles, t, t + job.horizon);
  }
  return { total: equity - 1, switches };
}

parentPort?.on("message", ({ index, input }: { index: number; input: PathJob }) => {
  try {
    parentPort!.postMessage({ index, output: run(input) });
  } catch (err) {
    parentPort!.postMessage({ index, error: (err as Error).message });
  }
});
