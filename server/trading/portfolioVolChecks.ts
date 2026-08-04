// Portfolio vol targeting checks. Run: npx tsx server/trading/portfolioVolChecks.ts
//
// The load-bearing claim is the quadratic solve: that the returned multiplier
// puts the book EXACTLY on its budget, not approximately. So the checks feed
// the answer back through portfolioVolatility and assert the round trip,
// rather than just asserting the multiplier looks sensible.

import {
  portfolioVolatility, volTargetMultiplier, volatilityOf, correlationLookup,
  type RiskLeg,
} from "./portfolioVol";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const uncorrelated = () => 0;
const perfectly = () => 1;

// --- the maths --------------------------------------------------------------
const one: RiskLeg[] = [{ symbol: "A", weight: 0.5, vol: 0.02 }];
check("a single leg's vol is weight x vol",
  Math.abs(portfolioVolatility(one, perfectly) - 0.01) < 1e-12,
  portfolioVolatility(one, perfectly).toFixed(6));

// Two identical perfectly-correlated legs = double the risk, NOT sqrt(2)x.
// This is the entire point of the module: per-symbol sizing thinks it has
// halved the risk here, and it has not.
const twinsCorrelated: RiskLeg[] = [
  { symbol: "A", weight: 0.25, vol: 0.02 },
  { symbol: "B", weight: 0.25, vol: 0.02 },
];
check("two perfectly correlated halves = one whole",
  Math.abs(portfolioVolatility(twinsCorrelated, perfectly) - 0.01) < 1e-12,
  portfolioVolatility(twinsCorrelated, perfectly).toFixed(6));

check("two UNcorrelated halves are sqrt(2)/2 of that",
  Math.abs(portfolioVolatility(twinsCorrelated, uncorrelated) - 0.01 / Math.SQRT2) < 1e-12,
  portfolioVolatility(twinsCorrelated, uncorrelated).toFixed(6));

check("correlation strictly increases portfolio vol",
  portfolioVolatility(twinsCorrelated, perfectly) > portfolioVolatility(twinsCorrelated, uncorrelated));

// --- the solve puts the book exactly on budget -------------------------------
function roundTrip(held: RiskLeg[], cand: RiskLeg, target: number, corr: (a: string, b: string) => number) {
  const r = volTargetMultiplier(held, cand, target, corr);
  const scaled = { ...cand, weight: cand.weight * r.multiplier };
  return { r, achieved: portfolioVolatility([...held, scaled], corr) };
}

const held: RiskLeg[] = [{ symbol: "A", weight: 0.3, vol: 0.02 }];
const cand: RiskLeg = { symbol: "B", weight: 0.3, vol: 0.02 };

for (const [label, corr] of [["correlated", perfectly], ["uncorrelated", uncorrelated],
  ["half-correlated", () => 0.5]] as const) {
  const target = 0.008;
  const { r, achieved } = roundTrip(held, cand, target, corr);
  check(`solve lands the book ON budget (${label})`,
    Math.abs(achieved - target) < 1e-9 || r.multiplier === 1,
    `mult=${r.multiplier.toFixed(4)} achieved=${(achieved * 100).toFixed(4)}% target=${(target * 100).toFixed(4)}%`);
}

// --- it never scales UP -------------------------------------------------------
const roomy = volTargetMultiplier(held, cand, 10, perfectly);
check("a huge budget still never sizes above the request", roomy.multiplier === 1,
  `mult=${roomy.multiplier}`);

// --- already over budget -------------------------------------------------------
const over = volTargetMultiplier(
  [{ symbol: "A", weight: 1, vol: 0.05 }], cand, 0.01, perfectly);
check("no new risk when already over budget", over.multiplier === 0, over.reason);

// --- monotonicity ---------------------------------------------------------------
let monotonic = true;
for (let i = 1; i < 20; i++) {
  const a = volTargetMultiplier(held, cand, 0.002 * i, perfectly).multiplier;
  const b = volTargetMultiplier(held, cand, 0.002 * (i + 1), perfectly).multiplier;
  if (b < a - 1e-12) monotonic = false;
}
check("a larger budget never allows less", monotonic);

let monotonic2 = true;
for (let i = 1; i < 10; i++) {
  const a = volTargetMultiplier(held, { ...cand, vol: 0.01 * i }, 0.01, perfectly).multiplier;
  const b = volTargetMultiplier(held, { ...cand, vol: 0.01 * (i + 1) }, 0.01, perfectly).multiplier;
  if (b > a + 1e-12) monotonic2 = false;
}
check("a more volatile candidate never gets a bigger share", monotonic2);

// --- degenerate inputs must not produce NaN ------------------------------------
for (const [label, r] of [
  ["zero-vol candidate", volTargetMultiplier(held, { ...cand, vol: 0 }, 0.01, perfectly)],
  ["zero weight", volTargetMultiplier(held, { ...cand, weight: 0 }, 0.01, perfectly)],
  ["no budget set", volTargetMultiplier(held, cand, 0, perfectly)],
  ["empty book", volTargetMultiplier([], cand, 0.001, perfectly)],
] as const) {
  check(`${label} yields a finite multiplier in [0,1]`,
    Number.isFinite(r.multiplier) && r.multiplier >= 0 && r.multiplier <= 1,
    `mult=${r.multiplier}`);
}

// --- volatilityOf ---------------------------------------------------------------
check("volatilityOf of a constant series is 0", volatilityOf([0.01, 0.01, 0.01]) === 0);
check("volatilityOf needs 2 points", volatilityOf([0.01]) === 0);
check("volatilityOf is positive on varied data", volatilityOf([0.01, -0.02, 0.03, -0.01]) > 0);

// --- the scenario this module exists for ----------------------------------------
// Three correlated positions, each individually sized to a 0.4% vol target.
const three: RiskLeg[] = [
  { symbol: "BTC/USD", weight: 0.2, vol: 0.02 },
  { symbol: "ETH/USD", weight: 0.2, vol: 0.02 },
  { symbol: "SOL/USD", weight: 0.2, vol: 0.02 },
];
const naive = 0.2 * 0.02; // what per-symbol sizing believes each contributes
const real = portfolioVolatility(three, () => 0.9);
check("correlated book carries far more risk than per-symbol sizing assumes",
  real > naive * 2.5,
  `per-position ${(naive * 100).toFixed(2)}% -> book ${(real * 100).toFixed(2)}%`);

// --- the lookup the engine actually passes in ---------------------------------
// This was an inline closure in engine.ts and therefore untestable. Its
// asymmetry is the easy thing to get wrong: candidate-vs-held is measured,
// held-vs-held is not and must fall back to 1.
const lookup = correlationLookup("CAND", { "A": 0.3, "B": -0.2 });
check("lookup: a symbol against itself is 1", lookup("A", "A") === 1);
check("lookup: candidate vs held reads the measured value",
  lookup("CAND", "A") === 0.3 && lookup("A", "CAND") === 0.3, "symmetric in both argument orders");
check("lookup: negative correlations survive", lookup("CAND", "B") === -0.2);
check("lookup: held vs held falls back to 1 (conservative)", lookup("A", "B") === 1);
check("lookup: an unmeasured symbol falls back to 1", lookup("CAND", "ZZZ") === 1);

// And that the fallback actually makes the book look riskier, not safer.
const legsAB: RiskLeg[] = [
  { symbol: "A", weight: 0.2, vol: 0.02 },
  { symbol: "B", weight: 0.2, vol: 0.02 },
];
check("the held-vs-held fallback overstates rather than understates risk",
  portfolioVolatility(legsAB, lookup) >= portfolioVolatility(legsAB, () => 0),
  `${(portfolioVolatility(legsAB, lookup) * 100).toFixed(3)}% vs ${(portfolioVolatility(legsAB, () => 0) * 100).toFixed(3)}% if assumed independent`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
