// Load .env before ANY other import runs — brokers.ts and marketData.ts read
// process.env at module scope to decide paper vs live and synthetic vs real
// market data. Without this the app silently ignored a filled-in .env file:
// keys appeared configured to the user while the platform quietly stayed on
// synthetic data, which is exactly the failure you would not notice.
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import { networkInterfaces } from "os";
import { registerRoutes } from "./routes";
import { readAlpacaCredentials } from "./trading/brokers";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  // A second instance MUST fail to start, loudly.
  //
  // reusePort was set here (a Replit template default). On Linux SO_REUSEPORT
  // lets several processes bind the same port and the kernel load-balances
  // between them, so starting the app twice silently succeeded and BOTH
  // engines traded the same broker account. Every safety limit is per-process
  // in-memory state — max concurrent positions, the orders-per-minute cap, the
  // daily-loss kill-switch — so N instances meant N times the intended risk,
  // while the dashboard showed whichever process happened to answer.
  //
  // Observed during verification: three instances live at once, one recording
  // an entry and another handling its exit, which booked the trade at zero P&L.
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      log(`FATAL: port ${port} is already in use — another instance is running.`);
      log("Only one engine may run at a time: two would trade the same account,");
      log("each enforcing its own position and loss limits. Stop the other first.");
      process.exit(1);
    }
    throw err;
  });

  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
    // Print the LAN address so you can open the app on your phone (same Wi-Fi).
    for (const addrs of Object.values(networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (a.family === "IPv4" && !a.internal) {
          log(`on your phone (same Wi-Fi): http://${a.address}:${port}`);
        }
      }
    }

    // State the data source unmissably at boot.
    //
    // Running on synthetic prices while believing you are on real ones is the
    // single most dangerous failure this app has: everything looks healthy,
    // the engine ticks, trades appear, and none of it means anything. It is
    // also easy to hit (a .env Notepad saved as ".env.txt" is enough), so it
    // gets an explicit banner rather than a field buried in /api/status.
    const creds = readAlpacaCredentials();
    if (creds) {
      log(`market data: ALPACA (real prices) — endpoint ${creds.baseUrl}`);
      log(
        creds.baseUrl.includes("paper-api")
          ? "orders: Alpaca PAPER account — no real money at risk"
          : "orders: *** ALPACA LIVE — REAL MONEY *** set ALPACA_BASE_URL to https://paper-api.alpaca.markets to use paper",
      );
    } else {
      log("market data: SYNTHETIC (simulated prices — NOT a real market)");
      log("  no Alpaca keys found. Create a .env next to package.json with");
      log("  ALPACA_KEY_ID / ALPACA_SECRET_KEY, then restart. On Windows check");
      log("  Notepad did not save it as .env.txt (run: dir /a .env*)");
    }
  });
})();
