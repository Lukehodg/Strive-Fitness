// Run backtests across CPU cores.
//
// WHY NOT GPU. The obvious ask for "make it faster" is the GPU, and it is the
// wrong lever for this workload — worth stating plainly so nobody spends a
// weekend on it:
//
//   - The ML model is a logistic regression: ~6,000 samples x 14 features.
//     That is a few million floating-point operations. Moving the data to a
//     GPU and back costs more than doing the arithmetic on the CPU.
//   - The actual hot path is the backtest LOOP, which is inherently
//     sequential: bar i+1's position depends on what happened at bar i. That
//     is the one shape a GPU cannot help with. No amount of hardware
//     parallelises a dependency chain.
//   - What IS parallel is the number of INDEPENDENT runs: 20 price paths x 12
//     configurations is 240 completely separate backtests. That is coarse-
//     grained parallelism, which belongs on CPU cores, not shader units.
//
// So: worker threads, one per core.
//
// MEASURED, not estimated — the first draft of this comment claimed "~20
// minutes to ~6" from memory and was wrong by two orders of magnitude. On the
// 4-core box this was written on, the 140-backtest margin sweep runs:
//
//     serial     10.0s
//     3 workers   4.5s     (2.2x)
//
// Sub-linear because each worker pays a one-off cost to register the
// TypeScript loader, which is a meaningful share of a 10-second job. The gain
// grows with sweep size — it is worth having for the 240-run configuration
// sweeps, and barely worth it for a single path. Both versions produce
// byte-identical numbers, which is the property that actually matters: a
// faster measurement that disagrees with the slow one is not a speedup, it is
// a second bug.
//
// (If this ever grows a genuinely heavy model — gradient boosting over years
// of tick data, or a neural net — the GPU question becomes real. That is the
// Freqtrade/FreqAI path in freqtrade/, which is Python and already has the
// ecosystem for it. It is not this TypeScript engine.)

import { Worker } from "worker_threads";
import { cpus } from "os";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

/** Leave one core for the OS so the machine stays usable during a long sweep. */
export function workerCount(): number {
  return Math.max(1, Math.min(cpus().length - 1, 8));
}

export interface ParallelJob<TIn, TOut> {
  /** Absolute path to a module exporting `run(input): output`. */
  workerModule: string;
  items: TIn[];
  onProgress?: (done: number, total: number) => void;
}

/**
 * Map `items` through a worker module across cores, preserving input order.
 *
 * Results are written back by index rather than pushed, because workers finish
 * out of order and a sweep whose rows silently permute is worse than a slow
 * one — you would be comparing configuration A's number against B's label.
 */
export async function runParallel<TIn, TOut>(job: ParallelJob<TIn, TOut>): Promise<TOut[]> {
  const { workerModule, items, onProgress } = job;
  if (!items.length) return [];

  const n = Math.min(workerCount(), items.length);
  const results = new Array<TOut>(items.length);
  let cursor = 0;
  let done = 0;

  await Promise.all(
    Array.from({ length: n }, () =>
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(
          // tsx registers a TypeScript loader in the parent; workers need it too.
          `import { register } from "tsx/esm/api"; register(); await import(${JSON.stringify(workerModule)});`,
          { eval: true },
        );

        const next = () => {
          if (cursor >= items.length) {
            worker.terminate();
            resolve();
            return;
          }
          const index = cursor++;
          worker.postMessage({ index, input: items[index] });
        };

        worker.on("message", (msg: { index: number; output?: TOut; error?: string }) => {
          if (msg.error) {
            worker.terminate();
            reject(new Error(`worker failed on item ${msg.index}: ${msg.error}`));
            return;
          }
          results[msg.index] = msg.output as TOut;
          onProgress?.(++done, items.length);
          next();
        });
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0 && done < items.length) reject(new Error(`worker exited ${code}`));
        });

        next();
      }),
    ),
  );

  return results;
}

/** Resolve a sibling module path for `workerModule`. */
export function siblingModule(importMetaUrl: string, file: string): string {
  return join(dirname(fileURLToPath(importMetaUrl)), file);
}
