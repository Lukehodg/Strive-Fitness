import { generateSyntheticCandles } from "../server/trading/marketData";
import { reportFacts } from "../server/trading/marketFacts";
const c = generateSyntheticCandles("FACTS", 20000, Date.UTC(2026, 0, 15));
const fails = reportFacts("CURRENT synthetic generator", c);
console.log(`\n${fails} of 6 stylized facts FAILED`);
process.exit(0);
