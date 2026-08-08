import type { BotConfig, StrategyParams } from "@shared/schema";
import { tradeablePairs } from "./forex";

// Ready-made trading universes.
//
// A large universe does NOT mean a large book. The engine scans everything
// here each tick but the portfolio limits in portfolio.ts still decide what it
// may actually hold (3 concurrent positions and 60% total exposure by
// default). So a wide universe buys SELECTION — more candidates to pick the
// best from — not more risk.

export interface UniversePreset {
  id: string;
  name: string;
  description: string;
  symbols: string[];
}

/**
 * The seven USD majors, quoted XXX/USD — so USD/JPY appears as JPY/USD. See
 * forex.ts for why every pair is turned to face USD.
 */
const MAJORS: string[] = tradeablePairs();

/**
 * The four most liquid pairs, and the tightest spreads available.
 *
 * EUR/USD at ~1 pip is about 0.009% a round trip; NZD/USD at ~2 pips is more
 * than three times that once the rate is taken into account. When cost is the
 * binding constraint, trading fewer and cheaper instruments is a real choice
 * and not just a smaller universe.
 */
const TIGHTEST: string[] = ["EUR/USD", "JPY/USD", "GBP/USD", "CAD/USD"];

export const UNIVERSE_PRESETS: UniversePreset[] = [
  {
    id: "majors",
    name: "FX majors",
    description:
      "All 7 USD majors. Quoted against USD, so USD/JPY shows as JPY/USD — " +
      "the same position, turned to face the dollar. Open 24/5, Sunday " +
      "evening to Friday evening, and exempt from the Pattern Day Trader rule.",
    symbols: MAJORS,
  },
  {
    id: "tightest",
    name: "Tightest spreads",
    description:
      "The 4 cheapest pairs to trade. Fewer candidates, but roughly half the " +
      "execution cost of the wider set — which matters more than selection " +
      "when no edge has been proven yet.",
    symbols: TIGHTEST,
  },
  {
    id: "eurusd",
    name: "EUR/USD only",
    description:
      "The single most liquid instrument in the world, and the cheapest here " +
      "at ~0.009% a round trip. No diversification at all — use this to test " +
      "one pair properly rather than to trade a book.",
    symbols: ["EUR/USD"],
  },
];

export function getPreset(id: string): UniversePreset | undefined {
  return UNIVERSE_PRESETS.find((p) => p.id === id);
}


// ---------------------------------------------------------------------------
// Trading profiles — risk settings and strategy parameters as one coherent set
// ---------------------------------------------------------------------------


export interface TradingProfile {
  id: string;
  name: string;
  description: string;
  config: Partial<BotConfig>;
  /** Per-strategy parameter overrides, keyed by strategy id. */
  params: Record<string, StrategyParams>;
}

export const TRADING_PROFILES: TradingProfile[] = [
  {
    id: "swing",
    name: "Swing (default)",
    description:
      "Wider stops, longer lookbacks, positions may be held overnight. Fewer " +
      "trades means less cost drag.",
    config: {
      dayTradingMode: false,
      stopLossPct: 0.03,
      takeProfitPct: 0.06,
      maxPositionPct: 0.25,
      intervalSeconds: 30,
      maxOrdersPerMinute: 3,
    },
    params: {
      sma_trend: { fast: 10, slow: 30 },
      rsi_reversion: { period: 14, oversold: 30, overbought: 60 },
      breakout: { entryLookback: 20, exitLookback: 10 },
    },
  },
  {
    id: "day",
    name: "Day trading",
    description:
      "Never holds overnight. Tighter stops and targets, shorter lookbacks, " +
      "smaller positions, faster polling — more trades per day.",
    config: {
      dayTradingMode: true,
      // WIDENED FROM 1.0%/1.5% ON EVIDENCE. A crypto taker round trip costs
      // 0.60% once priced correctly (see costs.ts), so a 1.5% target spent 40%
      // of its gross on execution before being right about anything. Sweeping
      // the target on 8 train + 8 unseen paths was monotonic — every widening
      // step raised returns AND cut trade count:
      //
      //     stop/target   cost/target   validate   trades
      //      1.0%/1.5%       40%          3.76%      147
      //      1.5%/3.0%       20%          4.30%      106
      //      2.0%/4.0%       15%          4.41%       96
      //      3.0%/6.0%       10%          4.53%       88
      //
      // NOT set to the winning 3.0%/6.0%, deliberately: the backtester does
      // not model maxHoldingMinutes, so the sweep never had to hit its target
      // inside a session. A 6% intraday move on crypto often would not arrive
      // before the holding cap forced a time-based exit at whatever price was
      // there — which the sweep cannot see and would not have penalised.
      // 2.0%/4.0% captures most of the gain while staying reachable in a day.
      stopLossPct: 0.02,
      takeProfitPct: 0.04,
      // Smaller per position: more concurrent trades and more turnover means
      // more chances to be wrong, so each one should hurt less.
      maxPositionPct: 0.1,
      intervalSeconds: 15,
      flatBeforeCloseMinutes: 15,
      noEntriesBeforeCloseMinutes: 30,
      // Raised with the target: a 4% move needs more than four hours to arrive
      // more often than a 1.5% one did. Still same-session — the never-hold-
      // overnight rule is what makes this profile a day-trading profile, not
      // the size of the target.
      maxHoldingMinutes: 360,
      maxConcurrentPositions: 4,
      // Day trading turns over far more orders than the swing default of 3
      // per minute allows; at 3 the engine spent most ticks rate-limited.
      maxOrdersPerMinute: 12,
    },
    params: {
      // Roughly half the swing lookbacks: reacts to intraday swings instead of
      // multi-day trends. RSI bands are widened so the mean-reversion strategy
      // still triggers on the smaller moves a single session produces.
      sma_trend: { fast: 5, slow: 20 },
      rsi_reversion: { period: 7, oversold: 35, overbought: 55 },
      breakout: { entryLookback: 10, exitLookback: 5 },
    },
  },
];

export function getProfile(id: string): TradingProfile | undefined {
  return TRADING_PROFILES.find((p) => p.id === id);
}
