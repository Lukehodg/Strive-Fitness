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
  feedSource: "alpaca" | "synthetic";
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
  position: () => json<Position | null>("/api/position"),
  positions: () => json<Position[]>("/api/positions"),
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
