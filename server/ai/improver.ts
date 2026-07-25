// The self-improvement engine ("adjacent AI mode").
//
// On a schedule (and on demand), it:
//   1. Re-optimizes each strategy's parameters with walk-forward validation.
//   2. Optionally asks the AI analyst to review the code + trades.
//   3. Turns findings into proposals, and applies them according to the
//      user's autonomy setting.
//
// Autonomy is deliberately layered so that "automatically improve itself" never
// means "silently rewrite a live money bot":
//   - propose_only  → nothing changes without an explicit Apply click.
//   - auto_tune_paper → validated *parameter* tweaks auto-apply, but only in
//     paper mode; code ideas and anything in live mode wait for review.
//   - full_auto → validated parameter tweaks auto-apply in any mode.
// Code-level changes are ALWAYS review-only in every mode — the AI proposes
// them, a human decides.

import { randomUUID } from "crypto";
import type { ImprovementProposal, StrategyParams } from "@shared/schema";
import { storage } from "../storage";
import { sendAlert } from "../alerts";
import { createMarketFeed } from "../trading/marketData";
import {
  STRATEGY_LIST,
  getActiveParams,
  setActiveParams,
} from "../trading/strategies";
import { computeStats } from "../trading/backtester";
import { signalModel } from "../ml/signalModel";
import { optimizeStrategy } from "./optimizer";
import { runAnalyst, analystAvailable } from "./analyst";

const CANDLES_FOR_OPTIMIZATION = 500;

class Improver {
  private feed = createMarketFeed();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  start(): void {
    // Prefer a mature model trained on real data (via `npm run train`).
    if (signalModel.loadFromDisk()) {
      const s = signalModel.status();
      storage.log(
        "info",
        `Loaded saved ML model (${s.dataInfo?.source ?? "?"} data, ` +
          `val ${(s.validationAccuracy * 100).toFixed(1)}%). Won't be overwritten by live retrains.`,
      );
    } else {
      // No saved model — train on the runtime feed so it's ready immediately.
      void this.trainSignalModel();
    }
    this.scheduleNext();
  }

  private trainMeta() {
    return {
      source: (this.feed.source === "alpaca" ? "live" : "synthetic") as
        | "live"
        | "synthetic",
      symbol: storage.getConfig().symbol,
      interval: "runtime",
    };
  }

  /** Retrain the ML signal model on the latest runtime feed. */
  async trainSignalModel(): Promise<number | null> {
    try {
      const config = storage.getConfig();
      const candles = await this.feed.getCandles(config.symbol, CANDLES_FOR_OPTIMIZATION);
      const acc = signalModel.train(candles, this.trainMeta());
      if (acc !== null) {
        const s = signalModel.status();
        storage.log(
          "info",
          `ML model retrained on ${s.samples} samples — validation accuracy ` +
            `${(acc * 100).toFixed(1)}% (${s.tradable ? "tradable" : "below chance floor, will not trade"}).`,
        );
      }
      return acc;
    } catch (err) {
      storage.log("info", `ML training error: ${(err as Error).message}`);
      return null;
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    const minutes = Math.max(5, storage.getConfig().improveIntervalMinutes);
    this.timer = setTimeout(() => {
      const config = storage.getConfig();
      if (config.improveEnabled) {
        void this.runCycle("scheduled").finally(() => this.scheduleNext());
      } else {
        this.scheduleNext();
      }
    }, minutes * 60_000);
  }

  available(): boolean {
    return analystAvailable();
  }

  /**
   * Run one improvement cycle. Returns the proposals created this run.
   * `trigger` is just for the log ("scheduled" vs "manual").
   */
  async runCycle(trigger: "scheduled" | "manual"): Promise<ImprovementProposal[]> {
    if (this.running) return [];
    this.running = true;
    const created: ImprovementProposal[] = [];
    try {
      const config = storage.getConfig();
      const candles = await this.feed.getCandles(
        config.symbol,
        CANDLES_FOR_OPTIMIZATION,
      );

      // Retrain the ML signal model on the latest data (it keeps learning) —
      // unless a mature model trained on real history is loaded, which we
      // never overwrite with the small live window.
      if (!signalModel.fromDisk) {
        signalModel.train(candles, this.trainMeta());
      }

      const currentParams: Record<string, StrategyParams> = {};
      const optimizerFindings: { strategyId: string; improvement: number }[] = [];

      // 1. Optimize each strategy's parameters (walk-forward validated).
      for (const strategy of STRATEGY_LIST) {
        const id = strategy.meta.id;
        const cur = getActiveParams(id);
        currentParams[id] = cur;
        const outcome = optimizeStrategy(strategy, candles, cur, config);
        optimizerFindings.push({
          strategyId: id,
          improvement: outcome.validation?.improvement ?? 0,
        });

        if (outcome.bestParams && outcome.validation) {
          const proposal = this.buildParamProposal(
            strategy.meta.id,
            strategy.meta.name,
            cur,
            outcome.bestParams,
            outcome.validation,
          );
          this.applyAutonomy(proposal);
          storage.addProposal(proposal);
          created.push(proposal);
        } else if (
          outcome.validation?.pbo !== undefined &&
          outcome.validation.pbo > 0.05
        ) {
          // A candidate beat the walk-forward test but failed the CSCV
          // overfitting audit — surface that the gate did its job.
          storage.log(
            "risk_block",
            `Rejected a candidate tune for ${strategy.meta.name}: passed ` +
              `walk-forward but failed the overfitting audit ` +
              `(PBO ${(outcome.validation.pbo * 100).toFixed(0)}% > 5%).`,
            id,
          );
        }
      }

      // 2. AI analyst (optional): code-level review of strategies + trades.
      let diagnosis: string | null = null;
      const report = await runAnalyst({
        performance: computeStats(
          storage.allTrades(),
          storage.getEquity(5000).map((e) => e.equity),
        ),
        recentTrades: storage.getTrades(50),
        currentParams,
        optimizerFindings,
      });
      if (report) {
        diagnosis = report.diagnosis;
        for (const s of report.codeSuggestions) {
          const strat = STRATEGY_LIST.find((x) => x.meta.id === s.strategyId);
          const proposal: ImprovementProposal = {
            id: randomUUID(),
            createdAt: Date.now(),
            strategyId: s.strategyId,
            strategyName: strat?.meta.name ?? s.strategyId,
            kind: "code",
            status: "pending", // code changes are always review-only
            title: s.title,
            rationale: s.suggestion,
            source: "ai",
            codeSuggestion: s.suggestion,
          };
          storage.addProposal(proposal);
          created.push(proposal);
        }
      }

      storage.setImproveMeta(Date.now(), diagnosis);
      const autoApplied = created.filter((p) => p.status === "auto_applied").length;
      storage.log(
        "info",
        `Improvement cycle (${trigger}): ${created.length} proposal(s), ` +
          `${autoApplied} auto-applied${
            report ? "; AI analysis included" : ""
          }.`,
      );
      return created;
    } catch (err) {
      storage.log("info", `Improvement cycle error: ${(err as Error).message}`);
      return created;
    } finally {
      this.running = false;
    }
  }

  private buildParamProposal(
    strategyId: string,
    strategyName: string,
    current: StrategyParams,
    proposed: StrategyParams,
    validation: ImprovementProposal["validation"],
  ): ImprovementProposal {
    const improvementPct = ((validation?.improvement ?? 0) * 100).toFixed(1);
    let rationale =
      `Walk-forward optimization found a parameter set that beats the current ` +
      `one by ${improvementPct}% on out-of-sample data (data the search never ` +
      `saw).`;
    if (validation?.pbo !== undefined) {
      rationale +=
        ` Overfitting audit: PBO ${(validation.pbo * 100).toFixed(1)}% ` +
        `(≤5% required)` +
        (validation.deflatedSharpe !== undefined
          ? `, deflated Sharpe confidence ${(validation.deflatedSharpe * 100).toFixed(0)}%.`
          : ".");
    }
    return {
      id: randomUUID(),
      createdAt: Date.now(),
      strategyId,
      strategyName,
      kind: "param",
      status: "pending",
      title: `Tune ${strategyName} parameters`,
      rationale,
      source: "optimizer",
      currentParams: current,
      proposedParams: proposed,
      validation,
    };
  }

  /** Auto-apply a parameter proposal if the autonomy setting permits it. */
  private applyAutonomy(proposal: ImprovementProposal): void {
    if (proposal.kind !== "param" || !proposal.proposedParams) return;
    const config = storage.getConfig();
    const allow =
      config.autonomy === "full_auto" ||
      (config.autonomy === "auto_tune_paper" && config.mode === "paper");
    if (!allow) return;

    setActiveParams(proposal.strategyId, proposal.proposedParams);
    proposal.status = "auto_applied";
    storage.log(
      "strategy_switch",
      `Auto-tuned ${proposal.strategyName}: ${describeParams(
        proposal.proposedParams,
      )} (${config.autonomy})`,
      proposal.strategyId,
    );
    sendAlert(
      "info",
      `Auto-tuned ${proposal.strategyName}`,
      `${describeParams(proposal.proposedParams)} — validated out-of-sample, PBO ${
        proposal.validation?.pbo !== undefined
          ? (proposal.validation.pbo * 100).toFixed(1) + "%"
          : "n/a"
      }.`,
    );
  }
}

function describeParams(p: StrategyParams): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}=${Number.isInteger(v) ? v : v.toFixed(2)}`)
    .join(", ");
}

export const improver = new Improver();
