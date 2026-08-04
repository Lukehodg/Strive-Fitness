// Which universe symbols would emit a BUY on the current synthetic feed?
import { createMarketFeed } from "../server/trading/marketData";
import { STRATEGY_LIST } from "../server/trading/strategies";
import { UNIVERSE_PRESETS } from "../server/trading/universes";

const feed = createMarketFeed();
const symbols = UNIVERSE_PRESETS.find((p) => p.id === "everything")!.symbols;
const hits: Array<{ symbol: string; strategy: string; strength: number }> = [];

for (const symbol of symbols) {
  const candles = await feed.getCandles(symbol, 200);
  for (const s of STRATEGY_LIST) {
    const sig = s.evaluate(candles, false);
    if (sig.action === "buy") hits.push({ symbol, strategy: s.meta.id, strength: sig.strength });
  }
}
hits.sort((a, b) => b.strength - a.strength);
console.log("BUY signals right now:", hits.length);
for (const h of hits.slice(0, 12)) console.log(`  ${h.symbol.padEnd(10)} ${h.strategy.padEnd(15)} strength ${h.strength.toFixed(2)}`);
const byStrategy: Record<string, string[]> = {};
for (const h of hits) (byStrategy[h.strategy] ??= []).push(h.symbol);
console.log("\nby strategy:");
for (const [k, v] of Object.entries(byStrategy)) console.log(`  ${k}: ${v.length} symbols — ${v.slice(0, 8).join(", ")}`);
process.exit(0);
