// Trading platform domain model.
//
// Everything the client and server share lives here as plain TypeScript
// types plus a few zod schemas for request validation. The platform runs
// fully in-memory by default (no database required), so there are no ORM
// tables here — persistence is optional and layered on top in storage.ts.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

/** A single OHLCV candle. `time` is epoch milliseconds at the bar's open. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Orders, positions, trades
// ---------------------------------------------------------------------------

export const OrderSides = ["buy", "sell"] as const;
export type OrderSide = (typeof OrderSides)[number];

export const OrderStatuses = ["filled", "rejected", "pending"] as const;
export type OrderStatus = (typeof OrderStatuses)[number];

/** A request the engine hands to a broker. */
export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  /** Quantity in base units (e.g. BTC). */
  qty: number;
  /** Free-text reason recorded for the audit log. */
  reason?: string;
  /**
   * Maker-first limit order offset (fraction). 0/undefined = market order.
   * Ignored by brokers that don't simulate/support resting orders.
   */
  limitOffsetPct?: number;
  /** Never delay this order for a better price (e.g. a stop-loss). */
  forceTaker?: boolean;
  /**
   * Maker-only entry: if the order cannot rest as a limit, reject it rather
   * than crossing the spread. Never applied to exits.
   *
   * This is not redundant with limitOffsetPct. An equity order for less than
   * one share CANNOT be a limit order at Alpaca and silently becomes a market
   * order — so on a small account, where every equity position is fractional,
   * entries cross the spread every time however the offset is configured.
   */
  makerOnly?: boolean;
  /** Current bar's high/low, used to simulate whether a resting order fills. */
  bar?: { high: number; low: number };
}

/** The broker's response to an order request. */
export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
  status: OrderStatus;
  reason?: string;
  message?: string;
  createdAt: number;
  /** How the order filled — informational, shown in the decision log. */
  fillType?: "maker" | "taker";
}

/** An open position in a single symbol. */
export interface Position {
  symbol: string;
  /** Positive for long. This platform is long/flat only (no shorting). */
  qty: number;
  avgEntryPrice: number;
  /** Latest mark price used for unrealized P&L. */
  markPrice: number;
  unrealizedPnl: number;
  openedAt: number;
}

/** A completed round-trip (entry closed by an exit). */
export interface Trade {
  id: string;
  symbol: string;
  strategy: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  /** Realized profit/loss in quote currency (e.g. USD). */
  pnl: number;
  /** Return on the trade as a fraction (0.02 = +2%). */
  returnPct: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Strategies & signals
// ---------------------------------------------------------------------------

export type SignalAction = "buy" | "sell" | "hold";

/** A strategy's decision for the current bar. */
export interface Signal {
  action: SignalAction;
  /** Conviction in [0, 1]; used for position sizing. */
  strength: number;
  reason: string;
}

export interface StrategyMeta {
  id: string;
  name: string;
  description: string;
  /** Market regimes this strategy is designed for. */
  bestRegimes: MarketRegime[];
  /** Tunable parameters and their allowed ranges (for the optimizer + UI). */
  params: ParamSpec[];
}

/** One tunable numeric parameter of a strategy. */
export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  /** Search granularity for the optimizer. */
  step: number;
  default: number;
}

/** A concrete set of parameter values, keyed by ParamSpec.key. */
export type StrategyParams = Record<string, number>;

// ---------------------------------------------------------------------------
// Market regime (used by the AI selector)
// ---------------------------------------------------------------------------

export const MarketRegimes = [
  "trending_up",
  "trending_down",
  "ranging",
  "volatile",
] as const;
export type MarketRegime = (typeof MarketRegimes)[number];

// ---------------------------------------------------------------------------
// Equity & performance
// ---------------------------------------------------------------------------

export interface EquityPoint {
  time: number;
  /** Total account value: cash + marked-to-market positions. */
  equity: number;
  cash: number;
}

export interface PerformanceStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  /** Largest peak-to-trough equity drop as a fraction. */
  maxDrawdown: number;
  /** Mean return per trade as a fraction. */
  avgReturn: number;
  /** Per-bar Sharpe ratio of the equity curve (not annualized). */
  sharpe: number;
}

// ---------------------------------------------------------------------------
// Bot configuration & status
// ---------------------------------------------------------------------------

export const TradingModes = ["paper", "live"] as const;
export type TradingMode = (typeof TradingModes)[number];

/** User-tunable configuration. All risk limits are enforced server-side. */
export interface BotConfig {
  /** Primary trading symbol, e.g. "BTC/USD". Always part of the universe. */
  symbol: string;
  /**
   * Extra symbols the engine may trade alongside `symbol`. Empty keeps the
   * original single-symbol behaviour. Crypto ("BTC/USD") and equities
   * ("AAPL") can be mixed; asset-class rules are applied per symbol.
   */
  extraSymbols?: string[];
  /** Max positions held simultaneously across the whole universe. */
  maxConcurrentPositions: number;
  /** Ceiling on summed position value, as a fraction of equity. */
  maxTotalExposurePct: number;
  /**
   * Ceiling on correlation-weighted exposure. Holding BTC and ETH is close to
   * holding double BTC; this is what stops "diversification" that isn't.
   */
  maxCorrelatedExposurePct: number;
  /**
   * Day-trading mode: never carry a position overnight.
   *
   * Equities are flattened before the bell; 24/7 instruments are capped by
   * holding time instead, since they have no close to flatten against.
   */
  dayTradingMode: boolean;
  /** Exit every equity position this many minutes before the session close. */
  flatBeforeCloseMinutes: number;
  /** Stop opening new positions this many minutes before the close. */
  noEntriesBeforeCloseMinutes: number;
  /** Max minutes any position may be held (applies to 24/7 instruments). */
  maxHoldingMinutes: number;
  /**
   * Order-rate ceiling, a runaway-loop guard rather than a strategy setting.
   * Day trading legitimately needs a higher ceiling than swing trading; at 3
   * the engine spent most ticks logging "order rate limit reached".
   */
  maxOrdersPerMinute: number;
  /**
   * Confidence governor: scale risk DOWN from the configured limits when
   * measured conditions (win rate, drawdown, sample size) do not justify
   * them, and pause new entries when they are poor. Never scales above the
   * limits — see trading/confidence.ts for why that asymmetry is deliberate.
   */
  confidenceGovernor: boolean;
  /**
   * Maker-only entries: if a resting limit order doesn't fill, SKIP the entry
   * rather than crossing the spread. Exits are unaffected. Cuts entry cost by
   * the taker/maker spread at the price of missing some entries — see
   * trading/makerEval.ts for the measured trade-off.
   */
  makerOnlyEntries: boolean;
  /**
   * Portfolio-level volatility budget. Per-symbol sizing gives each position
   * the intended risk; this caps what they add up to once correlation is
   * counted. Three correlated positions each sized to 0.4% vol make a ~1.2%
   * book, not a 0.4% one. See trading/portfolioVol.ts.
   */
  portfolioVolTarget: boolean;
  /** Target per-bar standard deviation of TOTAL account equity. */
  portfolioVolTargetPct: number;
  /**
   * Observed fee rates, as fractions (0.0025 = 0.25%). Null uses the built-in
   * default for the asset class. Set these to what your statements actually
   * show — a wrong cost model is the fastest way to manufacture a fake edge.
   */
  cryptoTakerFee?: number | null;
  cryptoMakerFee?: number | null;
  equityTakerFee?: number | null;
  equityMakerFee?: number | null;
  /**
   * Event blackout: don't open new positions around scheduled releases
   * (payrolls, EIA inventories, FOMC). This makes no prediction about what a
   * release will do — it only declines to be holding leverage through one.
   * See trading/events.ts.
   */
  eventBlackout: boolean;
  /** Minutes before a scheduled release to stop opening positions. */
  eventBlackoutBeforeMinutes: number;
  /** Minutes after it to keep standing down while the spread is wide. */
  eventBlackoutAfterMinutes: number;
  /** paper = simulated fills; live = real broker orders (requires keys). */
  mode: TradingMode;
  /** Fraction of equity to deploy on a full-conviction entry (0.25 = 25%). */
  maxPositionPct: number;
  /** Hard stop: if equity drops this fraction below the day's start, halt. */
  dailyLossLimitPct: number;
  /** Per-trade stop-loss as a fraction below entry. */
  stopLossPct: number;
  /** Per-trade take-profit as a fraction above entry. */
  takeProfitPct: number;
  /** How often the engine evaluates, in seconds. */
  intervalSeconds: number;
  /** When true the AI selector chooses the active strategy automatically. */
  autoSelectStrategy: boolean;
  /** Active strategy id (used when autoSelectStrategy is false). */
  activeStrategyId: string;
  /** When true the self-improvement engine runs on a schedule. */
  improveEnabled: boolean;
  /** How much the improver is allowed to change on its own. */
  autonomy: AutonomyLevel;
  /** How often the improver runs a cycle, in minutes. */
  improveIntervalMinutes: number;
  /**
   * Maker-first limit order offset (fraction below/above price for entries
   * and take-profit exits). 0 disables — pure market/taker orders. This is
   * the single highest-certainty cost reduction available: a lower fee and
   * no added slippage in exchange for occasionally not filling.
   */
  limitOrderOffsetPct: number;
  /**
   * When true, position size is also adjusted by volatility targeting and
   * the strategy's own fractional-Kelly track record — both bounded so they
   * can only move sizing within maxPositionPct, never past it.
   */
  adaptiveSizing: boolean;
  /** Per-bar target volatility used by volatility targeting when adaptiveSizing is on. */
  volTargetPct: number;
  /** Kelly fraction (0.5 = half-Kelly) used when adaptiveSizing is on. */
  kellyFraction: number;
}

/**
 * How much the self-improvement engine may change without human sign-off.
 *  - propose_only: never changes anything; every idea waits for your Apply.
 *  - auto_tune_paper: validated *parameter* tweaks auto-apply in paper mode;
 *    code changes and anything in live mode still wait for you.
 *  - full_auto: validated parameter tweaks auto-apply in any mode. Code-level
 *    changes are always surfaced for review (never silently self-committed).
 */
export const AutonomyLevels = [
  "propose_only",
  "auto_tune_paper",
  "full_auto",
] as const;
export type AutonomyLevel = (typeof AutonomyLevels)[number];

export const DEFAULT_CONFIG: BotConfig = {
  symbol: "BTC/USD",
  extraSymbols: [],
  maxConcurrentPositions: 3,
  maxTotalExposurePct: 0.6,
  maxCorrelatedExposurePct: 0.35,
  dayTradingMode: false,
  flatBeforeCloseMinutes: 15,
  noEntriesBeforeCloseMinutes: 30,
  maxHoldingMinutes: 240,
  maxOrdersPerMinute: 3,
  confidenceGovernor: true,
  makerOnlyEntries: false,
  portfolioVolTarget: true,
  // 0.8% per bar. Deliberately above the 0.4% per-POSITION default: a book of
  // several positions should be allowed more absolute risk than any one of
  // them, just not the unbounded sum that per-symbol sizing implies.
  portfolioVolTargetPct: 0.008,
  cryptoTakerFee: null,
  cryptoMakerFee: null,
  equityTakerFee: null,
  equityMakerFee: null,
  eventBlackout: true,
  eventBlackoutBeforeMinutes: 30,
  eventBlackoutAfterMinutes: 15,
  mode: "paper",
  maxPositionPct: 0.25,
  dailyLossLimitPct: 0.05,
  stopLossPct: 0.03,
  takeProfitPct: 0.06,
  intervalSeconds: 30,
  autoSelectStrategy: true,
  activeStrategyId: "sma_trend",
  improveEnabled: true,
  autonomy: "auto_tune_paper",
  improveIntervalMinutes: 60,
  limitOrderOffsetPct: 0.0006,
  adaptiveSizing: true,
  volTargetPct: 0.004,
  kellyFraction: 0.5,
};

export interface BotStatus {
  running: boolean;
  /** True when the kill-switch (daily loss limit) has tripped. */
  halted: boolean;
  haltReason?: string;
  mode: TradingMode;
  /** Whether real broker credentials are configured. */
  liveKeysConfigured: boolean;
  symbol: string;
  activeStrategyId: string;
  activeStrategyName: string;
  regime: MarketRegime | "unknown";
  lastEvaluatedAt: number | null;
  lastPrice: number | null;
}

// ---------------------------------------------------------------------------
// Audit / decision log
// ---------------------------------------------------------------------------

export const DecisionKinds = [
  "signal",
  "order",
  "risk_block",
  "strategy_switch",
  "halt",
  "resume",
  "info",
] as const;
export type DecisionKind = (typeof DecisionKinds)[number];

/** One line in the human-readable audit trail shown in the UI. */
export interface DecisionLogEntry {
  id: string;
  time: number;
  kind: DecisionKind;
  strategy?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Backtest results
// ---------------------------------------------------------------------------

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  stats: PerformanceStats;
  finalEquity: number;
  startEquity: number;
  returnPct: number;
  /** Per-bar Sharpe of the backtest equity curve. */
  sharpe: number;
  /**
   * Deflated Sharpe Ratio: P(true Sharpe > best-of-N-trials-by-chance).
   * ~0.5 = indistinguishable from luck; near 1 = likely genuine.
   */
  deflatedSharpe?: number;
  /**
   * Minimum Track Record Length: bars of live evidence needed to confirm this
   * Sharpe statistically exceeds zero. null = Sharpe ≤ 0 (never confirmable).
   */
  minTrackRecordBars?: number | null;
  /** Per-bar equity returns (server-side only; stripped from API responses). */
  returns?: number[];
}

/** One strategy's score from the AI selector's ranking. */
export interface StrategyScore {
  strategyId: string;
  strategyName: string;
  score: number;
  returnPct: number;
  winRate: number;
  maxDrawdown: number;
  trades: number;
  regimeFit: boolean;
}

// ---------------------------------------------------------------------------
// Self-improvement proposals
// ---------------------------------------------------------------------------

export const ProposalKinds = ["param", "code"] as const;
export type ProposalKind = (typeof ProposalKinds)[number];

export const ProposalStatuses = [
  "pending",
  "applied",
  "auto_applied",
  "rejected",
] as const;
export type ProposalStatus = (typeof ProposalStatuses)[number];

/** How a proposed parameter set scored in the walk-forward validation. */
export interface ProposalValidation {
  /** Return of the proposed params on the training window. */
  inSampleReturn: number;
  /** Return of the proposed params on the held-out test window. */
  outOfSampleReturn: number;
  /** Return of the current params on the same held-out window. */
  baselineOutOfSampleReturn: number;
  /** outOfSampleReturn − baselineOutOfSampleReturn. Positive = genuine edge. */
  improvement: number;
  outOfSampleTrades: number;
  /**
   * Probability of Backtest Overfitting (CSCV): how often the in-sample
   * winner ranks below median out-of-sample. Must be ≤ 0.05 to apply.
   */
  pbo?: number;
  /** Deflated Sharpe of the winning candidate vs all trials. */
  deflatedSharpe?: number;
}

/** A single improvement the engine surfaces (and may auto-apply). */
export interface ImprovementProposal {
  id: string;
  createdAt: number;
  strategyId: string;
  strategyName: string;
  kind: ProposalKind;
  status: ProposalStatus;
  title: string;
  /** Human-readable explanation, including any AI diagnosis. */
  rationale: string;
  /** Where the proposal came from. */
  source: "optimizer" | "ai";
  // Parameter proposals:
  currentParams?: StrategyParams;
  proposedParams?: StrategyParams;
  validation?: ProposalValidation;
  // Code proposals (always review-only):
  codeSuggestion?: string;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const AlertLevels = ["info", "warning", "critical"] as const;
export type AlertLevel = (typeof AlertLevels)[number];

/** An operational alert (kill-switch trip, fill, stall, …). */
export interface Alert {
  id: string;
  time: number;
  level: AlertLevel;
  title: string;
  message: string;
  acknowledged: boolean;
}

// ---------------------------------------------------------------------------
// ML signal model
// ---------------------------------------------------------------------------

export interface FeatureImportance {
  name: string;
  /** Learned weight on the standardized feature (sign = direction). */
  weight: number;
}

/** Where the training data came from. */
export interface MLDataInfo {
  /** "real" = downloaded market history, "live"/"synthetic" = the runtime feed. */
  source: "real" | "live" | "synthetic";
  symbol: string;
  /** Candle interval used for training (e.g. "1h"). */
  interval: string;
  /** Number of candles the training dataset was built from. */
  bars: number;
  /** Epoch ms of the first and last training candle. */
  from: number | null;
  to: number | null;
}

/** Public status of the trainable ML signal model. */
export interface MLStatus {
  trained: boolean;
  trainedAt: number | null;
  /** Training samples used in the last fit. */
  samples: number;
  /** In-sample accuracy (optimistic — for reference only). */
  trainAccuracy: number;
  /** Purged walk-forward out-of-sample accuracy (the honest number). */
  validationAccuracy: number;
  /** True when validationAccuracy clears the "better than chance" floor. */
  tradable: boolean;
  /** Minimum validation accuracy required before the model may trade. */
  tradableFloor: number;
  /** Accuracy of always predicting the majority class (the real bar to beat). */
  baselineRate: number;
  featureImportances: FeatureImportance[];
  /** Latest predicted probability that price rises over the horizon. */
  lastProbability: number | null;
  /** How validation accuracy was estimated. */
  validationMethod: string;
  /** Labeling scheme used. */
  labeling: string;
  /** Provenance of the training data. */
  dataInfo: MLDataInfo | null;
  /** True when the current model was loaded from a saved (trained) file. */
  fromDisk: boolean;
  /** Meta-labeling model: learns when the primary signal is right and sizes bets. */
  meta: MetaModelStatus | null;
}

/** Status of the meta-labeling (bet-sizing) model. */
export interface MetaModelStatus {
  /** Signal-samples the meta model was trained on. */
  samples: number;
  /** Held-out accuracy at predicting "primary signal was correct". */
  validationAccuracy: number;
  /** Fraction of primary signals the meta model approves (bet coverage). */
  coverage: number;
}

// ---------------------------------------------------------------------------
// Request validation schemas
// ---------------------------------------------------------------------------

export const updateConfigSchema = z
  .object({
    symbol: z.string().min(3).max(20),
    extraSymbols: z.array(z.string().min(1).max(20)).max(20).optional(),
    maxConcurrentPositions: z.number().int().min(1).max(10).optional(),
    maxTotalExposurePct: z.number().min(0.05).max(1).optional(),
    maxCorrelatedExposurePct: z.number().min(0.05).max(1).optional(),
    dayTradingMode: z.boolean().optional(),
    flatBeforeCloseMinutes: z.number().int().min(1).max(120).optional(),
    noEntriesBeforeCloseMinutes: z.number().int().min(1).max(240).optional(),
    maxHoldingMinutes: z.number().int().min(5).max(1440).optional(),
    maxOrdersPerMinute: z.number().int().min(1).max(60).optional(),
    confidenceGovernor: z.boolean().optional(),
    makerOnlyEntries: z.boolean().optional(),
    portfolioVolTarget: z.boolean().optional(),
    portfolioVolTargetPct: z.number().min(0.001).max(0.1).optional(),
    // Capped at 1% a side: anything higher is a typo, and a typo here silently
    // rewrites every backtest.
    cryptoTakerFee: z.number().min(0).max(0.01).nullable().optional(),
    cryptoMakerFee: z.number().min(0).max(0.01).nullable().optional(),
    equityTakerFee: z.number().min(0).max(0.01).nullable().optional(),
    equityMakerFee: z.number().min(0).max(0.01).nullable().optional(),
    eventBlackout: z.boolean().optional(),
    eventBlackoutBeforeMinutes: z.number().int().min(0).max(240).optional(),
    eventBlackoutAfterMinutes: z.number().int().min(0).max(240).optional(),
    mode: z.enum(TradingModes),
    maxPositionPct: z.number().min(0.01).max(1),
    dailyLossLimitPct: z.number().min(0.005).max(0.5),
    stopLossPct: z.number().min(0.005).max(0.5),
    takeProfitPct: z.number().min(0.005).max(2),
    intervalSeconds: z.number().int().min(5).max(3600),
    autoSelectStrategy: z.boolean(),
    activeStrategyId: z.string().min(1),
    improveEnabled: z.boolean(),
    autonomy: z.enum(AutonomyLevels),
    improveIntervalMinutes: z.number().int().min(5).max(1440),
    limitOrderOffsetPct: z.number().min(0).max(0.02),
    adaptiveSizing: z.boolean(),
    volTargetPct: z.number().min(0.0005).max(0.05),
    kellyFraction: z.number().min(0.1).max(1),
  })
  .partial();

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
