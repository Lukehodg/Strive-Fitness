import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { engine } from "./trading/engine";
import {
  STRATEGY_LIST,
  getActiveParams,
  setActiveParams,
  resetParams,
  getStrategy,
} from "./trading/strategies";
import { backtestStrategy } from "./trading/backtester";
import { selectStrategy } from "./trading/aiSelector";
import { createMarketFeed } from "./trading/marketData";
import { computeStats } from "./trading/backtester";
import { improver } from "./ai/improver";
import { deflatedSharpe, kurtosis, skewness } from "./ai/metrics";
import { signalModel } from "./ml/signalModel";
import { updateConfigSchema } from "@shared/schema";
import type { PerformanceStats } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const feed = createMarketFeed();

  // Start the self-improvement scheduler.
  improver.start();

  // -- Status & overview --------------------------------------------------

  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      ...engine.getStatus(),
      feedSource: engine.feedSource,
    });
  });

  app.get("/api/config", (_req: Request, res: Response) => {
    res.json(storage.getConfig());
  });

  app.patch("/api/config", (req: Request, res: Response) => {
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }
    // Live mode is only honored when credentials are actually configured.
    if (parsed.data.mode === "live" && !engine.liveKeysConfigured()) {
      return res.status(400).json({
        message:
          "Live mode requires Alpaca API keys (ALPACA_KEY_ID / ALPACA_SECRET_KEY). Staying in paper mode.",
      });
    }
    const updated = storage.setConfig(parsed.data);
    storage.log("info", "Configuration updated");
    res.json(updated);
  });

  // -- Portfolio ----------------------------------------------------------

  app.get("/api/equity", (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 500;
    res.json(storage.getEquity(limit));
  });

  app.get("/api/position", async (_req: Request, res: Response) => {
    res.json(await engine.getPosition());
  });

  app.get("/api/trades", (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 100;
    res.json(storage.getTrades(limit));
  });

  app.get("/api/performance", (_req: Request, res: Response) => {
    const trades = storage.allTrades();
    const equity = storage.getEquity(5000).map((e) => e.equity);
    const stats: PerformanceStats = computeStats(trades, equity);
    res.json(stats);
  });

  app.get("/api/decisions", (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 100;
    res.json(storage.getDecisions(limit));
  });

  // -- Strategies & analysis ----------------------------------------------

  app.get("/api/strategies", (_req: Request, res: Response) => {
    res.json(STRATEGY_LIST.map((s) => s.meta));
  });

  // Backtest all strategies on the latest market window and return rankings.
  app.get("/api/backtest", async (req: Request, res: Response) => {
    const config = storage.getConfig();
    const symbol = (req.query.symbol as string) || config.symbol;
    const candles = await feed.getCandles(symbol, 500);
    const results = STRATEGY_LIST.map((s) =>
      backtestStrategy(
        s,
        candles,
        10_000,
        config.stopLossPct,
        config.takeProfitPct,
      ),
    ).sort((a, b) => b.returnPct - a.returnPct);

    // Deflate each Sharpe for the number of strategies compared (the
    // "best of N looks good by chance" correction), then strip the bulky
    // per-bar returns before responding.
    const trialSharpes = results.map((r) => r.sharpe);
    const payload = results.map((r) => {
      const rets = r.returns ?? [];
      const dsr =
        rets.length > 2
          ? deflatedSharpe(r.sharpe, rets.length, skewness(rets), kurtosis(rets), trialSharpes)
          : undefined;
      const { returns: _returns, ...rest } = r;
      return { ...rest, deflatedSharpe: dsr };
    });
    res.json({ symbol, candleCount: candles.length, results: payload });
  });

  // Ask the AI selector what it would pick right now (transparency endpoint).
  app.get("/api/recommendation", async (req: Request, res: Response) => {
    const config = storage.getConfig();
    const symbol = (req.query.symbol as string) || config.symbol;
    const candles = await feed.getCandles(symbol, 500);
    const result = selectStrategy(candles);
    res.json({
      regime: result.regime,
      chosen: result.chosen.meta,
      rationale: result.rationale,
      scores: result.scores,
    });
  });

  // -- Controls -----------------------------------------------------------

  app.post("/api/control/start", (_req: Request, res: Response) => {
    engine.start();
    res.json(engine.getStatus());
  });

  app.post("/api/control/stop", (_req: Request, res: Response) => {
    engine.stop();
    res.json(engine.getStatus());
  });

  // Manual kill-switch clear after a daily-loss halt.
  app.post("/api/control/resume", (_req: Request, res: Response) => {
    engine.resume();
    res.json(engine.getStatus());
  });

  // -- Self-improvement ("AI Lab") ---------------------------------------

  // Current tunable parameters (spec + active values) for every strategy.
  app.get("/api/improve/params", (_req: Request, res: Response) => {
    res.json(
      STRATEGY_LIST.map((s) => ({
        strategyId: s.meta.id,
        name: s.meta.name,
        params: s.meta.params,
        current: getActiveParams(s.meta.id),
        defaults: s.defaultParams,
      })),
    );
  });

  app.get("/api/improve/proposals", (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 100;
    const meta = storage.getImproveMeta();
    res.json({
      proposals: storage.getProposals(limit),
      lastImproveAt: meta.lastImproveAt,
      lastDiagnosis: meta.lastDiagnosis,
      aiAvailable: improver.available(),
    });
  });

  // Trigger an improvement cycle right now.
  app.post("/api/improve/run", async (_req: Request, res: Response) => {
    const created = await improver.runCycle("manual");
    const meta = storage.getImproveMeta();
    res.json({ created, lastDiagnosis: meta.lastDiagnosis });
  });

  // Apply a pending parameter proposal (code proposals are review-only).
  app.post("/api/improve/proposals/:id/apply", (req: Request, res: Response) => {
    const p = storage.getProposal(req.params.id);
    if (!p) return res.status(404).json({ message: "Proposal not found" });
    if (p.kind !== "param" || !p.proposedParams) {
      return res.status(400).json({
        message: "Code proposals are review-only and can't be auto-applied.",
      });
    }
    setActiveParams(p.strategyId, p.proposedParams);
    storage.setProposalStatus(p.id, "applied");
    storage.log(
      "strategy_switch",
      `Applied tuned parameters for ${p.strategyName}`,
      p.strategyId,
    );
    res.json(storage.getProposal(p.id));
  });

  app.post("/api/improve/proposals/:id/reject", (req: Request, res: Response) => {
    const p = storage.setProposalStatus(req.params.id, "rejected");
    if (!p) return res.status(404).json({ message: "Proposal not found" });
    res.json(p);
  });

  // -- ML signal model ----------------------------------------------------

  app.get("/api/ml/status", (_req: Request, res: Response) => {
    res.json(signalModel.status());
  });

  // Retrain the ML signal model on the latest market data.
  app.post("/api/ml/train", async (_req: Request, res: Response) => {
    await improver.trainSignalModel();
    res.json(signalModel.status());
  });

  // Reset one strategy's parameters back to their audited defaults.
  app.post("/api/improve/params/:id/reset", (req: Request, res: Response) => {
    if (!getStrategy(req.params.id)) {
      return res.status(404).json({ message: "Strategy not found" });
    }
    const params = resetParams(req.params.id);
    storage.log("info", `Reset ${req.params.id} parameters to defaults`);
    res.json({ strategyId: req.params.id, current: params });
  });

  const httpServer = createServer(app);
  return httpServer;
}
