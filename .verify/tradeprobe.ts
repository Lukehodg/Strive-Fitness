import { generateSyntheticCandles } from "../server/trading/marketData";
import { backtestStrategy } from "../server/trading/backtester";
import { STRATEGY_LIST } from "../server/trading/strategies";
import { setCostOverrides } from "../server/trading/costs";
setCostOverrides({});
const p = generateSyntheticCandles("TURN0", 6000, Date.UTC(2026, 0, 15));
console.log("price range:", Math.min(...p.map(c=>c.close)).toFixed(2), "-", Math.max(...p.map(c=>c.close)).toFixed(2));
const sizing = { maxPositionPct: 0.1, adaptive: false, volTargetPct: 0.004, kellyFraction: 0.5, limitOrderOffsetPct: 0.0006, symbol: "BTC/USD", makerOnlyEntries: false };
for (const s of STRATEGY_LIST) {
  const withSizing = backtestStrategy(s, p, 10_000, 0.03, 0.06, sizing);
  const noSizing = backtestStrategy(s, p, 10_000, 0.03, 0.06);
  console.log(`${s.meta.id.padEnd(15)} withSizing trades=${withSizing.stats.totalTrades} ret=${(withSizing.returnPct*100).toFixed(2)}%  |  noSizing trades=${noSizing.stats.totalTrades}`);
}
process.exit(0);
