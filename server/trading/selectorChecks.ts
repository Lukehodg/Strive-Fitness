// Selector hysteresis checks. Run: npx tsx server/trading/selectorChecks.ts
//
// SWITCH_MARGIN was raised from 4 to 12 on walk-forward evidence, which now
// puts it ABOVE REGIME_FIT_BONUS (8). An earlier live bug came from exactly
// that relationship — a zero-trade incumbent could never be displaced, so the
// engine sat idle forever. These checks pin down that the deadlock is
// prevented by the zero-trade exemption rather than by the ordering of the two
// constants, so raising the margin further can never resurrect it.

import { selectStrategy, SWITCH_MARGIN, REGIME_FIT_BONUS, detectRegime } from "./aiSelector";
import { STRATEGY_LIST } from "./strategies";
import { generateSyntheticCandles } from "./marketData";
import { backtestStrategy } from "./backtester";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const candles = generateSyntheticCandles("SELCHK", 1200, Date.UTC(2026, 3, 1));

check("margin now exceeds the regime bonus (deliberate)",
  SWITCH_MARGIN > REGIME_FIT_BONUS, `margin=${SWITCH_MARGIN} bonus=${REGIME_FIT_BONUS}`);

// --- the deadlock that must not come back ------------------------------------
// A zero-trade incumbent has no record to protect. Whatever the margin, it must
// be replaceable — otherwise the engine sits idle forever, which is what
// happened live.
const zeroTradeIncumbent = STRATEGY_LIST.find((s) => {
  const r = backtestStrategy(s, candles);
  return r.stats.totalTrades === 0;
});
if (zeroTradeIncumbent) {
  const result = selectStrategy(candles, zeroTradeIncumbent.meta.id, 1000);
  check("a zero-trade incumbent is replaceable even at an absurd margin",
    result.chosen.meta.id !== zeroTradeIncumbent.meta.id,
    `incumbent=${zeroTradeIncumbent.meta.id} chose=${result.chosen.meta.id}`);
} else {
  // Not a failure — it just means this series gave every strategy trades.
  console.log("SKIP  no zero-trade strategy on this series to test the exemption");
}

// --- hysteresis still works in the normal case -------------------------------
const fresh = selectStrategy(candles);
const winner = fresh.chosen.meta.id;
const runnerUp = fresh.scores[1].strategyId;

check("with no incumbent, the top scorer is chosen",
  winner === fresh.scores[0].strategyId);

// An incumbent WITH a record is protected unless decisively beaten.
const gap = fresh.scores[0].score - fresh.scores[1].score;
const runnerUpTrades = fresh.scores[1].trades;
if (runnerUpTrades > 0) {
  const held = selectStrategy(candles, runnerUp, 1000);
  check("an incumbent with a record is held at a huge margin",
    held.chosen.meta.id === runnerUp, `gap=${gap.toFixed(2)}`);
  const flipped = selectStrategy(candles, runnerUp, 0);
  check("...and is displaced at zero margin",
    flipped.chosen.meta.id === winner);
} else {
  console.log("SKIP  runner-up has no trades; covered by the exemption check above");
}

// --- rationale is honest about what happened ---------------------------------
if (runnerUpTrades > 0) {
  const held = selectStrategy(candles, runnerUp, 1000);
  check("a hold says it is holding", /Staying with/.test(held.rationale), held.rationale);
}
check("a switch says what it chose and why", /Chose /.test(fresh.rationale), fresh.rationale);

// --- regime detection still classifies ----------------------------------------
check("regime is one of the known values",
  ["trending_up", "trending_down", "ranging", "volatile"].includes(detectRegime(candles)),
  detectRegime(candles));

// --- scores are ordered -------------------------------------------------------
check("scores come back ranked",
  fresh.scores.every((s, i) => i === 0 || s.score <= fresh.scores[i - 1].score));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
