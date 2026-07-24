// In-memory data store for the trading platform. Keeping state in memory means
// the app runs with zero external dependencies — no database to provision. It's
// the right default for a single-user personal tool. Everything here is capped
// so memory stays bounded during long 24/7 runs.

import { randomUUID } from "crypto";
import {
  DEFAULT_CONFIG,
  type BotConfig,
  type DecisionKind,
  type DecisionLogEntry,
  type EquityPoint,
  type Trade,
} from "@shared/schema";

const MAX_EQUITY_POINTS = 5_000;
const MAX_TRADES = 2_000;
const MAX_DECISIONS = 500;

class Storage {
  private config: BotConfig = { ...DEFAULT_CONFIG };
  private equity: EquityPoint[] = [];
  private trades: Trade[] = [];
  private decisions: DecisionLogEntry[] = [];

  getConfig(): BotConfig {
    return { ...this.config };
  }

  setConfig(patch: Partial<BotConfig>): BotConfig {
    this.config = { ...this.config, ...patch };
    return this.getConfig();
  }

  addEquityPoint(point: EquityPoint): void {
    this.equity.push(point);
    if (this.equity.length > MAX_EQUITY_POINTS) {
      this.equity.splice(0, this.equity.length - MAX_EQUITY_POINTS);
    }
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
    return entry;
  }

  getDecisions(limit = 100): DecisionLogEntry[] {
    return this.decisions.slice(-limit).reverse();
  }
}

export const storage = new Storage();
