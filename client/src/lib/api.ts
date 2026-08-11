export interface ConfidenceFactorInfo { name: string; score: number; detail: string }
export interface ConfidenceResponse {
  available: boolean;
  enabled?: boolean;
  score?: number;
  factors?: ConfidenceFactorInfo[];
  sizeMultiplier?: number;
  allowEntries?: boolean;
  summary?: string;
  message?: string;
}

export interface ExpectancyResponse {
  enabled: boolean;
  mode: string;
  gatesLiveOnly: boolean;
  available: boolean;
  proven?: boolean;
  trades?: number;
  meanReturn?: number;
  t?: number;
  reason?: string;
}

export interface CostsResponse {
  rates: Array<{
    assetClass: string;
    rates: { takerFee: number; makerFee: number; takerSlippage: number };
    overridden: boolean;
  }>;
  takeProfitPct: number;
  byAsset: Array<{
    symbol: string;
    takerRoundTrip: number;
    makerRoundTrip: number;
    takerShareOfTarget: number;
    makerShareOfTarget: number;
  }>;
}

export interface UpcomingEvent {
  kind: string;
  title: string;
  at: number;
  minutesAway: number;
  scope: string;
  severity: "high" | "medium";
  source: "rule" | "calendar";
}

export interface EventsResponse {
  enabled: boolean;
  /** True when the dated half of the calendar no longer covers today. */
  calendarStale: boolean;
  calendarValidThrough: number | null;
  blocked: Array<{ symbol: string; reason: string }>;
  upcoming: UpcomingEvent[];
}

export interface UniversePresetInfo {
  id: string;
  name: string;
  description: string;
  count: number;
  symbols: string[];
}
export interface UniversesResponse {
  presets: UniversePresetInfo[];
  current: { symbol: string; extraSymbols: string[] };
}
export interface TradingProfileInfo {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
}
export interface ProfilesResponse {
  profiles: TradingProfileInfo[];
  active: string;
}

// Thin typed wrappers over the trading API. Re-exports the shared domain types
// so the UI and server never drift.

import { apiRequest } from "./queryClient";
import type {
  BotConfig,
  BotStatus,
  DecisionLogEntry,
  EquityPoint,
  PerformanceStats,
  Position,
  StrategyMeta,
  Trade,
  UpdateConfigInput,
  BacktestResult,
  StrategyScore,
  MarketRegime,
  ImprovementProposal,
  ParamSpec,
  StrategyParams,
  AutonomyLevel,
  MLStatus,
  FeatureImportance,
  Alert,
} from "@shared/schema";

export type {
  BotConfig,
  BotStatus,
  DecisionLogEntry,
  EquityPoint,
  PerformanceStats,
  Position,
  StrategyMeta,
  Trade,
  UpdateConfigInput,
  BacktestResult,
  StrategyScore,
  MarketRegime,
  ImprovementProposal,
  ParamSpec,
  StrategyParams,
  AutonomyLevel,
  MLStatus,
  FeatureImportance,
  Alert,
};

export interface AlertsResponse {
  alerts: Alert[];
  telegramConfigured: boolean;
}

export interface StrategyParamInfo {
  strategyId: string;
  name: string;
  params: ParamSpec[];
  current: StrategyParams;
  defaults: StrategyParams;
}

export interface ProposalsResponse {
  proposals: ImprovementProposal[];
  lastImproveAt: number | null;
  lastDiagnosis: string | null;
  aiAvailable: boolean;
}

export interface StatusResponse extends BotStatus {
  feedSource: "oanda" | "synthetic";
}

export interface RecommendationResponse {
  regime: MarketRegime;
  chosen: StrategyMeta;
  rationale: string;
  scores: StrategyScore[];
}

export interface BacktestResponse {
  symbol: string;
  candleCount: number;
  results: BacktestResult[];
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  status: () => json<StatusResponse>("/api/status"),
  config: () => json<BotConfig>("/api/config"),
  equity: () => json<EquityPoint[]>("/api/equity?limit=500"),
  positions: () => json<Position[]>("/api/positions"),
  universes: () => json<UniversesResponse>("/api/universes"),
  profiles: () => json<ProfilesResponse>("/api/profiles"),
  confidence: () => json<ConfidenceResponse>("/api/confidence"),
  events: () => json<EventsResponse>("/api/events"),
  costs: () => json<CostsResponse>("/api/costs"),
  expectancy: () => json<ExpectancyResponse>("/api/expectancy"),
  applyUniverse: (id: string) =>
    fetch(`/api/universes/${id}/apply`, { method: "POST" }).then((r) => r.json()),
  applyProfile: (id: string) =>
    fetch(`/api/profiles/${id}/apply`, { method: "POST" }).then((r) => r.json()),
  trades: () => json<Trade[]>("/api/trades?limit=100"),
  performance: () => json<PerformanceStats>("/api/performance"),
  decisions: () => json<DecisionLogEntry[]>("/api/decisions?limit=100"),
  strategies: () => json<StrategyMeta[]>("/api/strategies"),
  backtest: () => json<BacktestResponse>("/api/backtest"),
  recommendation: () => json<RecommendationResponse>("/api/recommendation"),

  improveParams: () => json<StrategyParamInfo[]>("/api/improve/params"),
  proposals: () => json<ProposalsResponse>("/api/improve/proposals"),
  mlStatus: () => json<import("@shared/schema").MLStatus>("/api/ml/status"),
  alerts: () => json<AlertsResponse>("/api/alerts"),

  start: () => apiRequest("POST", "/api/control/start"),
  stop: () => apiRequest("POST", "/api/control/stop"),
  resume: () => apiRequest("POST", "/api/control/resume"),
  liquidate: () => apiRequest("POST", "/api/control/liquidate", { reason: "Manual liquidation from dashboard" }),
  updateConfig: (patch: UpdateConfigInput) =>
    apiRequest("PATCH", "/api/config", patch),
  runImprove: () => apiRequest("POST", "/api/improve/run"),
  trainMl: () => apiRequest("POST", "/api/ml/train"),
  ackAlerts: () => apiRequest("POST", "/api/alerts/ack"),
  applyProposal: (id: string) =>
    apiRequest("POST", `/api/improve/proposals/${id}/apply`),
  rejectProposal: (id: string) =>
    apiRequest("POST", `/api/improve/proposals/${id}/reject`),
  resetParams: (id: string) =>
    apiRequest("POST", `/api/improve/params/${id}/reset`),
};
