// Proof-of-expectancy checks. Run: npx tsx server/trading/expectancyChecks.ts
//
// This gate decides whether real money may be risked, so the failure that
// matters is a FALSE PASS: letting a losing strategy through. Most of these
// push on that side.

import { assessExpectancy, MIN_TRADES, MIN_T } from "./expectancy";
import type { Trade } from "@shared/schema";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

/** n trades whose returns are drawn deterministically around `mean`. */
function trades(n: number, mean: number, spread: number, strategy = "s1"): Trade[] {
  return Array.from({ length: n }, (_, i) => {
    // Alternating offsets: exact sample mean, controlled dispersion.
    const r = mean + (i % 2 === 0 ? spread : -spread);
    return {
      id: String(i), symbol: "BTC/USD", strategy, qty: 1,
      entryPrice: 100, exitPrice: 100 * (1 + r),
      entryTime: i, exitTime: i + 1,
      pnl: r * 100, returnPct: r, reason: "test",
    };
  });
}

// --- the failure that costs money -------------------------------------------
check("a LOSING strategy is refused",
  !assessExpectancy(trades(100, -0.002, 0.01), "s1", "BTC/USD").proven,
  assessExpectancy(trades(100, -0.002, 0.01), "s1", "BTC/USD").reason);

check("a break-even strategy is refused",
  !assessExpectancy(trades(100, 0, 0.01), "s1", "BTC/USD").proven);

check("a barely-positive but NOISY strategy is refused",
  !assessExpectancy(trades(100, 0.0001, 0.05), "s1", "BTC/USD").proven,
  assessExpectancy(trades(100, 0.0001, 0.05), "s1", "BTC/USD").reason);

// --- not enough evidence ------------------------------------------------------
check("a short record is refused however good it looks",
  !assessExpectancy(trades(MIN_TRADES - 1, 0.05, 0.001), "s1", "BTC/USD").proven,
  assessExpectancy(trades(MIN_TRADES - 1, 0.05, 0.001), "s1", "BTC/USD").reason);
check("no trades at all is refused",
  !assessExpectancy([], "s1", "BTC/USD").proven);

// --- what SHOULD pass ---------------------------------------------------------
const good = assessExpectancy(trades(100, 0.004, 0.008), "s1", "BTC/USD");
check("a consistently profitable record passes", good.proven, good.reason);
check("...and reports a positive t", good.t > MIN_T, `t=${good.t.toFixed(2)}`);

// --- isolation between strategies ---------------------------------------------
const mixed = [...trades(100, -0.01, 0.005, "loser"), ...trades(100, 0.004, 0.008, "winner")];
check("a winner is not dragged down by another strategy's losses",
  assessExpectancy(mixed, "winner", "BTC/USD").proven);
check("a loser is not rescued by another strategy's wins",
  !assessExpectancy(mixed, "loser", "BTC/USD").proven);
check("an unknown strategy id has no record and is refused",
  !assessExpectancy(mixed, "never-traded", "BTC/USD").proven);

// --- monotonicity ---------------------------------------------------------------
let monotonic = true;
for (let i = 1; i < 10; i++) {
  const a = assessExpectancy(trades(100, 0.001 * i, 0.01), "s1", "BTC/USD").t;
  const b = assessExpectancy(trades(100, 0.001 * (i + 1), 0.01), "s1", "BTC/USD").t;
  if (b < a - 1e-9) monotonic = false;
}
check("a more profitable record never scores lower", monotonic);

let noisier = true;
for (let i = 1; i < 8; i++) {
  const a = assessExpectancy(trades(100, 0.004, 0.005 * i), "s1", "BTC/USD").t;
  const b = assessExpectancy(trades(100, 0.004, 0.005 * (i + 1)), "s1", "BTC/USD").t;
  if (b > a + 1e-9) noisier = false;
}
check("a noisier record at the same mean never scores higher", noisier);

// --- degenerate inputs ---------------------------------------------------------
for (const [label, v] of [
  ["zero dispersion", assessExpectancy(trades(100, 0.004, 0), "s1", "BTC/USD")],
  ["single trade", assessExpectancy(trades(1, 0.5, 0), "s1", "BTC/USD")],
] as const) {
  check(`${label} yields a finite verdict`, Number.isFinite(v.t) && Number.isFinite(v.meanReturn),
    `t=${v.t}`);
}

// --- the reason is actionable ---------------------------------------------------
check("a refusal explains WHY, not just that",
  /trades|losing|luck/.test(assessExpectancy(trades(5, 0.01, 0), "s1", "BTC/USD").reason));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
