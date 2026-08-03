// Confidence governor checks. Run: npx tsx server/trading/confidenceChecks.ts

import { assessConfidence, ENTRY_FLOOR, type ConfidenceInput } from "./confidence";
import type { Trade } from "@shared/schema";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

function trades(n: number, winRate: number): Trade[] {
  return Array.from({ length: n }, (_, i) => {
    const win = i < Math.round(n * winRate);
    return {
      id: String(i), symbol: "BTC/USD", strategy: "breakout", qty: 1,
      entryPrice: 100, exitPrice: win ? 102 : 98,
      entryTime: i, exitTime: i + 1,
      pnl: win ? 2 : -2, returnPct: win ? 0.02 : -0.02, reason: "test",
    };
  });
}

const base: ConfidenceInput = {
  trades: trades(30, 0.6),
  equity: 10_000,
  dayStartEquity: 10_000,
  peakEquity: 10_000,
  regimeFit: true,
  mlEdge: null,
};

// --- healthy baseline ------------------------------------------------------
const good = assessConfidence(base);
check("healthy conditions score high", good.score > 0.7, `score=${good.score.toFixed(2)}`);
check("healthy conditions allow entries", good.allowEntries);
check("multiplier never exceeds 1 (config is a CEILING)", good.sizeMultiplier <= 1,
  `mult=${good.sizeMultiplier.toFixed(2)}`);

// --- the ceiling must hold even when everything is perfect -----------------
const perfect = assessConfidence({
  ...base, trades: trades(60, 1.0), equity: 20_000, peakEquity: 20_000,
  dayStartEquity: 10_000, mlEdge: 0.5,
});
check("perfect conditions still cannot exceed the ceiling", perfect.sizeMultiplier <= 1,
  `mult=${perfect.sizeMultiplier.toFixed(3)}`);

// --- drawdown ---------------------------------------------------------------
const drawdown = assessConfidence({ ...base, equity: 9_200, peakEquity: 10_000 });
check("drawdown lowers confidence", drawdown.score < good.score,
  `${good.score.toFixed(2)} -> ${drawdown.score.toFixed(2)}`);
check("deep drawdown blocks new entries", !assessConfidence({
  ...base, trades: trades(30, 0.3), equity: 8_900, peakEquity: 10_000, dayStartEquity: 10_000,
}).allowEntries);

// --- losing streak ----------------------------------------------------------
const losing = assessConfidence({ ...base, trades: trades(30, 0.2) });
check("poor win rate lowers confidence", losing.score < good.score,
  `${losing.score.toFixed(2)}`);

// --- sample size gating -----------------------------------------------------
const tiny = assessConfidence({ ...base, trades: trades(2, 1.0) });
const many = assessConfidence({ ...base, trades: trades(30, 1.0) });
check("2 perfect trades score below 30 perfect trades", tiny.score < many.score,
  `${tiny.score.toFixed(2)} vs ${many.score.toFixed(2)}`);
check("tiny sample cannot reach full size", tiny.sizeMultiplier < 0.9,
  `mult=${tiny.sizeMultiplier.toFixed(2)}`);
check("no trades at all does not crash", Number.isFinite(
  assessConfidence({ ...base, trades: [] }).score));

// --- floor ------------------------------------------------------------------
const dire = assessConfidence({
  ...base, trades: trades(30, 0.0), equity: 8_500, peakEquity: 10_000, dayStartEquity: 10_000,
  regimeFit: false,
});
check("dire conditions stop entries", !dire.allowEntries, `score=${dire.score.toFixed(2)}`);
check("but sizing never reaches zero (must keep gathering evidence)",
  dire.sizeMultiplier >= 0.25, `mult=${dire.sizeMultiplier.toFixed(2)}`);
check("entry floor is what it claims", ENTRY_FLOOR > 0 && ENTRY_FLOOR < 1);

// --- monotonicity: worse conditions never score higher ----------------------
let monotonic = true;
for (let i = 0; i <= 10; i++) {
  const a = assessConfidence({ ...base, equity: 10_000 - i * 100, peakEquity: 10_000 });
  const b = assessConfidence({ ...base, equity: 10_000 - (i + 1) * 100, peakEquity: 10_000 });
  if (b.score > a.score + 1e-9) monotonic = false;
}
check("confidence falls monotonically as drawdown deepens", monotonic);

// --- explainability ---------------------------------------------------------
check("every factor is reported", good.factors.length >= 5, `${good.factors.length} factors`);
check("summary names the weakest factor when not full confidence",
  drawdown.summary.toLowerCase().includes("weakest"), drawdown.summary);
check("ml edge only counted when the model trades",
  assessConfidence({ ...base, mlEdge: null }).factors.every((f) => f.name !== "Model edge"));

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
