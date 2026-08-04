import { createMarketFeed } from "../server/trading/marketData";
import { returnsOf } from "../server/trading/portfolio";
import { volatilityOf, portfolioVolatility } from "../server/trading/portfolioVol";

const feed = createMarketFeed();
for (const s of ["MKR/USD", "AVAX/USD", "SOL/USD", "ETH/USD"]) {
  const c = await feed.getCandles(s, 200);
  console.log(`${s.padEnd(10)} per-bar vol = ${(volatilityOf(returnsOf(c)) * 100).toFixed(4)}%`);
}
const c = await feed.getCandles("MKR/USD", 200);
const v = volatilityOf(returnsOf(c));
console.log(`\nWith weight 0.20 each and correlation 1.0:`);
for (const n of [1, 2, 3, 5]) {
  const legs = Array.from({ length: n }, (_, i) => ({ symbol: `S${i}`, weight: 0.2, vol: v }));
  console.log(`  ${n} position(s): book vol = ${(portfolioVolatility(legs, () => 1) * 100).toFixed(4)}%`);
}
process.exit(0);
