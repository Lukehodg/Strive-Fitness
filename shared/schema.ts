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
}

// ---------------------------------------------------------------------------
// Bot configuration & status
// ---------------------------------------------------------------------------

export const TradingModes = ["paper", "live"] as const;
export type TradingMode = (typeof TradingModes)[number];

/** User-tunable configuration. All risk limits are enforced server-side. */
export interface BotConfig {
  /** Trading symbol, e.g. "BTC/USD". */
  symbol: string;
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
}

// ---------------------------------------------------------------------------
// Request validation schemas
// ---------------------------------------------------------------------------

export const updateConfigSchema = z
  .object({
    symbol: z.string().min(3).max(20),
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
  })
  .partial();

export type UpdateConfigInput = z.infer<typeof updateConfigSchema>;
