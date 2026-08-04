// Does the synthetic feed behave like a market? Run: npm run facts
//
// Gate this before trusting any number the synthetic feed produced. It failed
// all six of these once, and two of the failures were bad enough to invalidate
// conclusions — see marketFacts.ts for what and why.
import { generateSyntheticCandles } from "./marketData";
import { reportFacts } from "./marketFacts";

let failures = 0;
for (const seed of ["FACTS-A", "FACTS-B", "FACTS-C"]) {
  failures += reportFacts(`synthetic feed · seed ${seed}`, generateSyntheticCandles(seed, 20000, Date.UTC(2026, 0, 15)));
}
console.log(
  failures === 0
    ? "\nALL STYLIZED FACTS HOLD on every seed.\n" +
      "Still synthetic — passing these does not make it a market. It only means\n" +
      "results are not an artifact of a qualitatively wrong price process."
    : `\n${failures} FACT(S) FAILED — numbers from this feed describe the generator.`,
);
process.exit(failures ? 1 : 0);
