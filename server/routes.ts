import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { engine } from "./trading/engine";
import { STRATEGY_LIST } from "./trading/strategies";
import { backtestStrategy } from "./trading/backtester";
import { selectStrategy } from "./trading/aiSelector";
import { createMarketFeed } from "./trading/marketData";
import { computeStats } from "./trading/backtester";
import { updateConfigSchema } from "@shared/schema";
import type { PerformanceStats } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const feed = createMarketFeed();

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
    res.json({ symbol, candleCount: candles.length, results });
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

  const httpServer = createServer(app);
  return httpServer;
}
