// Confidence governor.
//
// Position SIZE is already confidence-scaled: signal strength, volatility
// targeting and fractional Kelly all feed sizePosition(). What that misses is
// the state of the account as a whole. A strategy can keep emitting strong
// signals while the book quietly bleeds, and nothing steps in.
//
// This scores how much the recent evidence justifies taking risk, and lets the
// engine act on it.
//
// ONE DIRECTION ONLY: the user's configured limits are a CEILING. Confidence
// can pull risk down from them, never past them. Scaling *up* on high
// confidence would require the confidence estimate to be calibrated — to know
// that "0.9" really does mean nine times in ten — and nothing here has
// demonstrated that. An overconfident multiplier applied to a negative
// expectancy is precisely how an account dies, so the asymmetry is deliberate.

import type { Trade } from "@shared/schema";

export interface ConfidenceInput {
  /** Completed trades, most recent last. */
  trades: Trade[];
  /** Current equity. */
  equity: number;
  /** Equity at the start of the trading day. */
  dayStartEquity: number;
  /** Peak equity seen, for drawdown. */
  peakEquity: number;
  /** Does the active strategy suit the detected regime? */
  regimeFit: boolean;
  /** ML validation edge over baseline, or null when the model isn't trading. */
  mlEdge: number | null;
  /**
   * Minutes until the next broad-market scheduled release, or null when none
   * is in sight. Symbol-specific events are handled by the per-symbol blackout
   * in events.ts; this is the account-wide "the whole tape is about to move"
   * signal, which is a different thing from "don't enter XLE right now".
   */
  minutesToBroadEvent?: number | null;
}

export interface ConfidenceFactor {
  name: string;
  /** 0..1 — this factor's own reading. */
  score: number;
  detail: string;
}

export interface ConfidenceResult {
  /** 0..1 overall. Multiplies the user's risk ceiling; never exceeds 1. */
  score: number;
  factors: ConfidenceFactor[];
  /** Fraction of the configured max position this justifies. */
  sizeMultiplier: number;
  /** Whether new positions should be opened at all. */
  allowEntries: boolean;
  summary: string;
}

/** Below this, stop opening new risk and let existing positions resolve. */
export const ENTRY_FLOOR = 0.35;
/** Never shrink below this — a governor that goes to zero can never recover,
 *  because it would stop generating the trades it needs as evidence. */
const MIN_MULTIPLIER = 0.25;
/** Trades needed before a win rate means anything at all. */
const MIN_SAMPLE = 10;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Score current conditions. Every factor is something MEASURED — realised
 * results, drawdown, sample size — not the system's opinion of itself.
 */
export function assessConfidence(input: ConfidenceInput): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];
  const recent = input.trades.slice(-30);

  // 1. Sample size. With few trades nothing else is trustworthy, so this
  //    caps the others rather than averaging alongside them.
  const sample = clamp01(recent.length / MIN_SAMPLE);
  factors.push({
    name: "Sample size",
    score: sample,
    detail: `${recent.length} recent trade${recent.length === 1 ? "" : "s"}` +
      (recent.length < MIN_SAMPLE ? ` (need ${MIN_SAMPLE} to judge)` : ""),
  });

  // 2. Realised win rate. Centred on 50%: below chance earns no credit.
  const wins = recent.filter((t) => t.pnl > 0).length;
  const winRate = recent.length ? wins / recent.length : 0.5;
  const winScore = clamp01((winRate - 0.35) / 0.3);
  factors.push({
    name: "Win rate",
    score: winScore,
    detail: `${(winRate * 100).toFixed(0)}% of last ${recent.length || 0}`,
  });

  // 3. Drawdown from peak. The most direct evidence that current conditions
  //    are not working, and it responds before the kill-switch does.
  const dd = input.peakEquity > 0
    ? Math.max(0, (input.peakEquity - input.equity) / input.peakEquity)
    : 0;
  const ddScore = clamp01(1 - dd / 0.1); // full penalty by -10%
  factors.push({
    name: "Drawdown",
    score: ddScore,
    detail: `${(dd * 100).toFixed(1)}% below peak`,
  });

  // 4. Today's P&L against the day's open — the same axis the kill-switch
  //    watches, so risk tapers as it is approached rather than at the cliff.
  const dayPnl = input.dayStartEquity > 0
    ? (input.equity - input.dayStartEquity) / input.dayStartEquity
    : 0;
  const dayScore = clamp01(1 + dayPnl / 0.03);
  factors.push({
    name: "Today",
    score: dayScore,
    detail: `${dayPnl >= 0 ? "+" : ""}${(dayPnl * 100).toFixed(2)}% on the day`,
  });

  // 5. Regime fit of the running strategy.
  factors.push({
    name: "Regime fit",
    score: input.regimeFit ? 1 : 0.6,
    detail: input.regimeFit ? "strategy suits the regime" : "strategy is off-regime",
  });

  // 6. Scheduled event risk. Not a forecast of the release — only that the
  //    next two hours are a worse time to be adding leverage than a quiet
  //    Tuesday, because realised volatility around these prints is reliably
  //    higher whichever way they come out. Tapers back in over two hours
  //    rather than switching, so risk returns gradually after the print.
  const mins = input.minutesToBroadEvent;
  if (mins !== null && mins !== undefined) {
    const eventScore = clamp01(mins / 120);
    factors.push({
      name: "Event risk",
      score: eventScore,
      detail: `scheduled release in ${Math.round(mins)}m`,
    });
  }

  // 7. ML edge, only when the model is actually cleared to trade.
  if (input.mlEdge !== null) {
    const mlScore = clamp01(0.5 + input.mlEdge * 10);
    factors.push({
      name: "Model edge",
      score: mlScore,
      detail: `${(input.mlEdge * 100).toFixed(1)}pp over baseline`,
    });
  }

  // Sample size gates everything else: average the evidence, then scale by how
  // much evidence there is. With two trades behind it, a 100% win rate should
  // not licence full size.
  const evidence = factors.filter((f) => f.name !== "Sample size");
  const mean = evidence.reduce((a, f) => a + f.score, 0) / evidence.length;
  const score = clamp01(mean * (0.5 + 0.5 * sample));

  const sizeMultiplier = Math.max(MIN_MULTIPLIER, score);
  const allowEntries = score >= ENTRY_FLOOR;

  const weakest = [...factors].sort((a, b) => a.score - b.score)[0];
  const summary = allowEntries
    ? `Confidence ${(score * 100).toFixed(0)}% — sizing at ${(sizeMultiplier * 100).toFixed(0)}% of your maximum` +
      (score < 0.9 ? `; weakest factor: ${weakest.name.toLowerCase()} (${weakest.detail})` : "")
    : `Confidence ${(score * 100).toFixed(0)}% — below the ${(ENTRY_FLOOR * 100).toFixed(0)}% floor, ` +
      `holding off new entries. Weakest: ${weakest.name.toLowerCase()} (${weakest.detail})`;

  return { score, factors, sizeMultiplier, allowEntries, summary };
}
