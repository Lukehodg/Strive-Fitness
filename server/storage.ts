// In-memory data store for the trading platform. Keeping state in memory means
// the app runs with zero external dependencies — no database to provision. It's
// the right default for a single-user personal tool. Everything here is capped
// so memory stays bounded during long 24/7 runs.

import { randomUUID } from "crypto";
import {
  DEFAULT_CONFIG,
  type Alert,
  type AlertLevel,
  type BotConfig,
  type DecisionKind,
  type DecisionLogEntry,
  type EquityPoint,
  type ImprovementProposal,
  type ProposalStatus,
  type Trade,
} from "@shared/schema";
import { registerPersistence, schedulePersist } from "./persistence";

const MAX_EQUITY_POINTS = 5_000;
const MAX_TRADES = 2_000;
const MAX_DECISIONS = 500;
const MAX_PROPOSALS = 200;
const MAX_ALERTS = 200;

class Storage {
  private config: BotConfig = { ...DEFAULT_CONFIG };
  private equity: EquityPoint[] = [];
  private trades: Trade[] = [];
  private decisions: DecisionLogEntry[] = [];
  private proposals: ImprovementProposal[] = [];
  private alerts: Alert[] = [];
  private lastImproveAt: number | null = null;
  private lastDiagnosis: string | null = null;

  getConfig(): BotConfig {
    return { ...this.config };
  }

  setConfig(patch: Partial<BotConfig>): BotConfig {
    this.config = { ...this.config, ...patch };
    schedulePersist();
    return this.getConfig();
  }

  addEquityPoint(point: EquityPoint): void {
    this.equity.push(point);
    if (this.equity.length > MAX_EQUITY_POINTS) {
      this.equity.splice(0, this.equity.length - MAX_EQUITY_POINTS);
    }
    schedulePersist();
  }

  getEquity(limit = 500): EquityPoint[] {
    return this.equity.slice(-limit);
  }

  latestEquity(): EquityPoint | null {
    return this.equity.length ? this.equity[this.equity.length - 1] : null;
  }

  addTrade(trade: Trade): void {
    this.trades.push(trade);
    if (this.trades.length > MAX_TRADES) {
      this.trades.splice(0, this.trades.length - MAX_TRADES);
    }
    schedulePersist();
  }

  getTrades(limit = 100): Trade[] {
    return this.trades.slice(-limit).reverse();
  }

  allTrades(): Trade[] {
    return this.trades;
  }

  log(kind: DecisionKind, message: string, strategy?: string): DecisionLogEntry {
    const entry: DecisionLogEntry = {
      id: randomUUID(),
      time: Date.now(),
      kind,
      strategy,
      message,
    };
    this.decisions.push(entry);
    if (this.decisions.length > MAX_DECISIONS) {
      this.decisions.splice(0, this.decisions.length - MAX_DECISIONS);
    }
    schedulePersist();
    return entry;
  }

  getDecisions(limit = 100): DecisionLogEntry[] {
    return this.decisions.slice(-limit).reverse();
  }

  // -- Self-improvement proposals ----------------------------------------

  addProposal(p: ImprovementProposal): void {
    this.proposals.push(p);
    if (this.proposals.length > MAX_PROPOSALS) {
      this.proposals.splice(0, this.proposals.length - MAX_PROPOSALS);
    }
    schedulePersist();
  }

  getProposals(limit = 100): ImprovementProposal[] {
    return this.proposals.slice(-limit).reverse();
  }

  getProposal(id: string): ImprovementProposal | undefined {
    return this.proposals.find((p) => p.id === id);
  }

  setProposalStatus(id: string, status: ProposalStatus): ImprovementProposal | undefined {
    const p = this.getProposal(id);
    if (p) {
      p.status = status;
      schedulePersist();
    }
    return p;
  }

  setImproveMeta(at: number, diagnosis: string | null): void {
    this.lastImproveAt = at;
    if (diagnosis !== null) this.lastDiagnosis = diagnosis;
    schedulePersist();
  }

  getImproveMeta(): { lastImproveAt: number | null; lastDiagnosis: string | null } {
    return { lastImproveAt: this.lastImproveAt, lastDiagnosis: this.lastDiagnosis };
  }

  // -- Alerts -------------------------------------------------------------

  addAlert(level: AlertLevel, title: string, message: string): Alert {
    const alert: Alert = {
      id: randomUUID(),
      time: Date.now(),
      level,
      title,
      message,
      acknowledged: false,
    };
    this.alerts.push(alert);
    if (this.alerts.length > MAX_ALERTS) {
      this.alerts.splice(0, this.alerts.length - MAX_ALERTS);
    }
    schedulePersist();
    return alert;
  }

  getAlerts(limit = 100): Alert[] {
    return this.alerts.slice(-limit).reverse();
  }

  acknowledgeAlerts(): number {
    let n = 0;
    for (const a of this.alerts) {
      if (!a.acknowledged) {
        a.acknowledged = true;
        n++;
      }
    }
    if (n > 0) schedulePersist();
    return n;
  }

  // -- Persistence --------------------------------------------------------

  private snapshot() {
    return {
      config: this.config,
      equity: this.equity,
      trades: this.trades,
      decisions: this.decisions,
      proposals: this.proposals,
      alerts: this.alerts,
      lastImproveAt: this.lastImproveAt,
      lastDiagnosis: this.lastDiagnosis,
    };
  }

  private restore(data: unknown): void {
    const d = data as Partial<ReturnType<Storage["snapshot"]>>;
    if (d.config) this.config = { ...DEFAULT_CONFIG, ...d.config };
    if (Array.isArray(d.equity)) this.equity = d.equity;
    if (Array.isArray(d.trades)) this.trades = d.trades;
    if (Array.isArray(d.decisions)) this.decisions = d.decisions;
    if (Array.isArray(d.proposals)) this.proposals = d.proposals;
    if (Array.isArray(d.alerts)) this.alerts = d.alerts;
    this.lastImproveAt = d.lastImproveAt ?? null;
    this.lastDiagnosis = d.lastDiagnosis ?? null;
  }

  registerWithPersistence(): void {
    registerPersistence(
      "storage",
      () => this.snapshot(),
      (data) => this.restore(data),
    );
  }
}

export const storage = new Storage();
storage.registerWithPersistence();
