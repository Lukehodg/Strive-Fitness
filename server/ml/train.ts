// Offline training CLI: download real market history, train the ML signal
// model on it (triple-barrier labels + purged walk-forward validation), and
// save the trained model to disk so the running app loads a mature model.
//
// Usage:
//   npm run train                       # BTC/USD, 1h, ~2 years
//   npm run train -- --symbol ETH/USD --interval 1h --bars 26000
//   npm run train -- --refresh          # force a fresh download

// Load .env first — the downloader may use provider credentials.
import "dotenv/config";

import { loadHistory, type Interval } from "./dataSource";
import { signalModel } from "./signalModel";

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function main() {
  const symbol = arg("--symbol", "BTC/USD")!;
  const interval = (arg("--interval", "1h") as Interval)!;
  const bars = Number(arg("--bars", "17520"));
  const refresh = process.argv.includes("--refresh");

  console.log(`Downloading ${bars} ${interval} candles for ${symbol}…`);
  const hist = await loadHistory(symbol, interval, bars, refresh);
  const first = new Date(hist.candles[0].time).toISOString().slice(0, 10);
  const last = new Date(hist.candles[hist.candles.length - 1].time).toISOString().slice(0, 10);
  console.log(`Got ${hist.candles.length} candles from ${hist.source} (${first} → ${last}).`);

  console.log("Training (triple-barrier labels, purged walk-forward CV)…");
  const acc = signalModel.train(hist.candles, {
    source: "real",
    symbol,
    interval,
  });
  if (acc === null) {
    console.error("Not enough data to train. Try a larger --bars value.");
    process.exit(1);
  }

  const s = signalModel.status();
  signalModel.saveToDisk();

  console.log("\n=== Training complete ===");
  console.log(`Samples:              ${s.samples}`);
  console.log(`Training accuracy:    ${(s.trainAccuracy * 100).toFixed(1)}%  (in-sample, optimistic)`);
  console.log(`Validation accuracy:  ${(s.validationAccuracy * 100).toFixed(1)}%  (${s.validationMethod})`);
  console.log(`Majority baseline:    ${(s.baselineRate * 100).toFixed(1)}%  (always-predict-majority)`);
  console.log(`Edge over baseline:   ${((s.validationAccuracy - s.baselineRate) * 100).toFixed(1)}%`);
  console.log(`Tradable:             ${s.tradable ? "YES" : "no — no real edge, will not trade"}`);
  console.log("Top features:");
  for (const f of s.featureImportances.slice(0, 5)) {
    console.log(`  ${f.name.padEnd(14)} ${f.weight >= 0 ? "+" : ""}${f.weight.toFixed(3)}`);
  }
  console.log(`\nModel saved. Start the app and it will load this model automatically.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Training failed:", err.message);
  process.exit(1);
});
