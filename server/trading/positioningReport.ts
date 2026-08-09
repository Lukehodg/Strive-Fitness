// "Other people's trading history" the honest, obtainable version:
//
//   npm run positioning
//   npm run positioning -- preset=majors
//   npm run positioning -- symbols=EUR/USD,GBP/USD
//
// There is no legitimate API for other individual traders' private trading
// records. What OANDA DOES publish is an aggregate, anonymized snapshot of
// its OWN clients' current positions per instrument (see positioning.ts) —
// real, public, free data, but scoped to one broker's client base, not "the
// market" or "other traders" generally.
//
// This samples that snapshot at spaced points across roughly the last week
// (best effort — see positioning.ts on retention) and reports, per symbol,
// the current net long/short split, its range and trend over the sample,
// and a plain read of what that would mean under the classic RETAIL
// CONTRARIAN heuristic: a crowd heavily on one side is read as more likely
// to reverse, not less. That heuristic is NOT something this project has
// measured — unlike the strategies in expectancy.ts and aiSelector.ts,
// which were tested and found to lose money, this number has not been
// tested here at all. Treat it as an input to look at, not a signal.
import "dotenv/config";

import { readOandaCredentials } from "./brokers";
import { fetchPositionBook, snapshotTimes, type BookSnapshot } from "./positioning";
import { venueSymbol } from "./assets";
import { storage } from "../storage";
import { getPreset, UNIVERSE_PRESETS } from "./universes";

const creds = readOandaCredentials();
if (!creds) {
  console.log("No OANDA credentials found.");
  console.log("");
  console.log("  Set these in .env, next to package.json:");
  console.log("    OANDA_API_TOKEN=<your v20 personal access token>");
  console.log("    OANDA_ACCOUNT_ID=<e.g. 001-004-1234567-001>");
  console.log("");
  console.log("  Position book access needs a valid token but no account");
  console.log("  activity — a practice-account token is enough to try this.");
  process.exit(1);
}

let symbols: string[];
const presetArg = process.argv.slice(2).find((a) => a.startsWith("preset="));
const symbolsArg = process.argv.slice(2).find((a) => a.startsWith("symbols="));
if (symbolsArg) {
  symbols = symbolsArg.slice("symbols=".length).split(",").map((s) => s.trim()).filter(Boolean);
} else if (presetArg) {
  const id = presetArg.slice("preset=".length);
  const preset = getPreset(id);
  if (!preset) {
    console.error(`Unknown preset "${id}". Try: ${UNIVERSE_PRESETS.map((u) => u.id).join(", ")}`);
    process.exit(1);
  }
  symbols = preset.symbols;
} else {
  const config = storage.getConfig();
  symbols = [config.symbol, ...(config.extraSymbols ?? [])];
}

const DAYS = 7;
const STEP_HOURS = 12;
const times = snapshotTimes(DAYS, STEP_HOURS);

console.log(`OANDA client position book — last ${DAYS} days, sampled every ${STEP_HOURS}h`);
console.log(`  endpoint: ${creds.baseUrl}`);
console.log(`  symbols:  ${symbols.join(", ")}`);
console.log("");
console.log("This is OANDA's own client base, not the whole market — read it as one");
console.log("broker's sentiment snapshot, not a market consensus.");
console.log("");

for (const symbol of symbols) {
  const instrument = venueSymbol(symbol);
  const snapshots: BookSnapshot[] = [];
  for (const t of times) {
    const snap = await fetchPositionBook(instrument, t);
    if (snap) snapshots.push(snap);
  }

  if (snapshots.length === 0) {
    console.log(`${symbol} (${instrument}): no data returned — check the instrument is valid and tradeable.`);
    console.log("");
    continue;
  }

  const current = snapshots[0];
  const longs = snapshots.map((s) => s.netLongPercent);
  const avgLong = longs.reduce((a, b) => a + b, 0) / longs.length;
  const minLong = Math.min(...longs);
  const maxLong = Math.max(...longs);
  const oldest = snapshots[snapshots.length - 1];
  const trendPts = current.netLongPercent - oldest.netLongPercent;
  const trend = Math.abs(trendPts) < 1 ? "flat" : trendPts > 0 ? "shifting long" : "shifting short";
  const missing = times.length - snapshots.length;

  console.log(`${symbol} (${instrument})`);
  console.log(`  now:        ${current.netLongPercent.toFixed(1)}% long / ${current.netShortPercent.toFixed(1)}% short  (as of ${current.time})`);
  console.log(`  ${DAYS}d range:  ${minLong.toFixed(1)}% – ${maxLong.toFixed(1)}% long, avg ${avgLong.toFixed(1)}%`);
  console.log(`  trend:      ${trend} (${trendPts >= 0 ? "+" : ""}${trendPts.toFixed(1)}pp over the window)`);
  console.log(`  samples:    ${snapshots.length}/${times.length}${missing ? ` (${missing} time points OANDA had no snapshot for)` : ""}`);
  if (current.netLongPercent >= 65 || current.netLongPercent <= 35) {
    const side = current.netLongPercent >= 65 ? "long" : "short";
    console.log(`  note:       crowd is lopsided ${side} (${current.netLongPercent.toFixed(0)}%) — under the classic`);
    console.log(`              retail-contrarian heuristic that's read as a CAUTION on ${side}, not a confirmation.`);
    console.log(`              Unverified here — see the module comment before acting on it.`);
  }
  console.log("");
}
