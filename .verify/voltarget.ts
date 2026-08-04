import { createMarketFeed } from "../server/trading/marketData";
import { computeVolatilityMultiplier } from "../server/trading/sizing";
import { returnsOf } from "../server/trading/portfolio";
import { volatilityOf } from "../server/trading/portfolioVol";

const feed = createMarketFeed();
for (const target of [0.004, 0.0015, 0.001]) {
  const out: string[] = [];
  for (const s of ["BTC/USD", "ETH/USD", "SOL/USD"]) {
    const c = await feed.getCandles(s, 200);
    const realised = volatilityOf(returnsOf(c));
    out.push(`${s}: realised ${(realised * 100).toFixed(3)}% -> mult ${computeVolatilityMultiplier(c, target).toFixed(3)}`);
  }
  console.log(`target ${(target * 100).toFixed(2)}%/bar`);
  for (const o of out) console.log("   " + o);
}
process.exit(0);
