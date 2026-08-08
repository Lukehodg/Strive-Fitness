// Does the synthetic feed behave like a market? Run: npm run facts
//
// Gate this before trusting any number the synthetic feed produced. It failed
// all six of these once, and two of the failures were bad enough to invalidate
// conclusions — see marketFacts.ts for what and why.
//
// ---------------------------------------------------------------------------
// WHY THIS JUDGES THE SUITE AND NOT EACH PATH
// ---------------------------------------------------------------------------
//
// Every fact here is a sample statistic on a finite path — about 10,000 bars,
// since the generator anchors to a 7-day block. At that sample size, and with
// the fat tails the process is SUPPOSED to have, the standard error on a
// correlation is large enough that an occasional path lands the wrong side of
// a fixed threshold through nothing but luck. Asserting each path
// independently therefore produces a gate that fails perhaps one run in five
// while the generator is perfectly healthy — and a gate that cries wolf is
// worse than no gate, because it trains you to skip the output.
//
// So a fact fails the suite when it fails on more than TWO of thirty paths.
//
// Those two numbers are measured, not chosen for looking reasonable. Sweeping
// the generator over 120-150 seeds gives a per-path failure rate of about 1%
// when it is healthy, against about 15% when MAX_VOL_MULTIPLE is set back to
// the 8 it used to be. Over 30 paths, a "more than 2" rule almost never fires
// on the first (P ~ 0.3%) and almost always fires on the second (P ~ 85%).
//
// THE FIRST VERSION OF THIS RULE WAS TOO LOOSE AND I ONLY FOUND OUT BY TESTING
// IT. Tolerating a quarter of 18 paths let the cap-8 regression through at
// 3/18 — the gate passed on a generator I had just proved was broken. The
// check on a check is to reintroduce the bug and confirm it fails; a tolerance
// that has not been through that is a guess.
//
// The structural failures this exists to catch all showed up on 100% of paths
// — uniform shocks gave excess kurtosis -0.97 everywhere, persistent drift
// gave return ACF +0.12 everywhere, constant volatility gave clustering ~0.00
// everywhere. Those trip it instantly. One unlucky seed does not.

import { generateSyntheticCandles } from "./marketData";
import { checkStylizedFacts, reportFacts } from "./marketFacts";

// EVERY ASSET CLASS, not just one seed family.
//
// The generator is no longer one process: it runs at a different volatility
// per asset class, and the GARCH variance cap is defined in multiples of that
// volatility, so the recursion can behave differently at different scales.
// Checking only bare tickers — which is what "FACTS-A" is, since it has no
// slash and therefore classifies as a STOCK — left the crypto and FX paths
// entirely unverified while reporting "all facts hold". Widening this to all
// three classes immediately turned up seeds at 118 and 156 excess kurtosis,
// which is what drove MAX_VOL_MULTIPLE down from 8 to 3.
//
// These are the names the presets actually trade, so a failure here is a
// failure on data the engine will really see.
// Ten paths per class. Eighteen total was not enough to tell a 1% failure rate
// from a 15% one, which is precisely the distinction the gate has to make.
const SUITES: Array<[string, string[]]> = [
  ["equity", ["FACTS-A", "FACTS-B", "FACTS-C", "AAPL", "NVDA", "META", "MSFT", "SPY", "QQQ", "TSLA"]],
  ["crypto", ["BTC/USD", "ETH/USD", "SOL/USD", "LTC/USD", "DOGE/USD", "XRP/USD", "LINK/USD", "AVAX/USD", "DOT/USD", "BCH/USD"]],
  ["forex", ["EUR/USD", "GBP/USD", "JPY/USD", "CHF/USD", "CAD/USD", "AUD/USD", "NZD/USD", "SEK/USD", "NOK/USD", "SGD/USD"]],
];

/** Paths a single fact may fail on before the suite is judged broken. */
const TOLERATED_FAILURES = 2;

const paths = SUITES.flatMap(([label, seeds]) =>
  seeds.map((seed) => ({
    label: `${label} · ${seed}`,
    candles: generateSyntheticCandles(seed, 20000, Date.UTC(2026, 0, 15)),
  })),
);

// Per-path detail first — when something IS wrong, the table is how you find
// out which fact and by how much.
for (const p of paths) reportFacts(`synthetic feed · ${p.label}`, p.candles);

// Then the verdict, across paths.
const failuresByFact = new Map<string, string[]>();
for (const p of paths) {
  for (const fact of checkStylizedFacts(p.candles)) {
    if (!failuresByFact.has(fact.name)) failuresByFact.set(fact.name, []);
    if (!fact.pass) failuresByFact.get(fact.name)!.push(p.label);
  }
}

let broken = 0;
console.log(
  `\n=== verdict across ${paths.length} paths (a fact fails above ${TOLERATED_FAILURES} of them) ===`,
);
for (const [name, failed] of Array.from(failuresByFact.entries())) {
  const ok = failed.length <= TOLERATED_FAILURES;
  if (!ok) broken++;
  console.log(
    `  [${ok ? "ok  " : "FAIL"}] ${name.padEnd(52)} ${String(failed.length).padStart(2)}/${paths.length}` +
      (failed.length ? `  (${failed.join(", ")})` : ""),
  );
}

console.log(
  broken === 0
    ? "\nALL STYLIZED FACTS HOLD across every asset class.\n" +
      "Still synthetic — passing these does not make it a market. It only means\n" +
      "results are not an artifact of a qualitatively wrong price process."
    : `\n${broken} FACT(S) FAILED systematically — numbers from this feed describe the generator.`,
);
process.exit(broken ? 1 : 0);
