// Load .env before ANY other import runs — brokers.ts and marketData.ts read
// process.env at module scope to decide paper vs live and synthetic vs real
// market data. Without this the app silently ignored a filled-in .env file:
// keys appeared configured to the user while the platform quietly stayed on
// synthetic data, which is exactly the failure you would not notice.
import "dotenv/config";

import express, { type Request, Response, NextFunction } from "express";
import { networkInterfaces } from "os";
import { registerRoutes } from "./routes";
import { readAlpacaCredentials, readOandaCredentials } from "./trading/brokers";
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
    const oanda = readOandaCredentials();
    if (creds) {
      log(`market data: ALPACA (real prices) — endpoint ${creds.baseUrl}`);
      log(
        creds.baseUrl.includes("paper-api")
          ? "orders: Alpaca PAPER account — no real money at risk"
          : "orders: *** ALPACA LIVE — REAL MONEY *** set ALPACA_BASE_URL to https://paper-api.alpaca.markets to use paper",
      );
    }
    if (oanda) {
      log(`market data: OANDA (real FX prices) — endpoint ${oanda.baseUrl}`);
      log(
        oanda.baseUrl.includes("fxpractice")
          ? "orders: OANDA PRACTICE account — no real money at risk"
          : "orders: *** OANDA LIVE — REAL MONEY *** set OANDA_BASE_URL to https://api-fxpractice.oanda.com to use practice",
      );
    }
    if (creds && oanda) {
      // Both configured. Only ONE venue is used at a time, so say which, or
      // the banner implies a combined book that does not exist.
      log(
        "  both venues configured — liveBroker in Settings decides which is used " +
          "(default 'auto' prefers Alpaca). No venue carries both FX and crypto.",
      );
    }
    if (creds || oanda) {
      // Fall through: at least one real feed is live, so no synthetic warning.
    } else if (process.env.REQUIRE_REAL_DATA === "1") {
      // Opt-in refusal to start on simulated prices.
      //
      // The synthetic fallback is what makes this app run with zero setup, and
      // it is also what let the project reach forty-odd commits without a
      // single number coming from a real market. Every performance figure in
      // the README describes a random-walk generator, not a market. Setting
      // REQUIRE_REAL_DATA=1 puts the friction where it belongs.
      log("");
      log("REFUSING TO START — REQUIRE_REAL_DATA=1 but no broker keys found.");
      log("  Create a .env next to package.json with ALPACA_KEY_ID and");
      log("  ALPACA_SECRET_KEY (crypto/equities), or OANDA_API_TOKEN and");
      log("  OANDA_ACCOUNT_ID (FX), or unset REQUIRE_REAL_DATA to run on the");
      log("  simulated feed. On Windows check Notepad did not save it as");
      log("  .env.txt (run: dir /a .env*)");
      process.exit(1);
    } else {
      log("");
      log("  ####################################################");
      log("  #  SYNTHETIC DATA — THESE ARE NOT REAL PRICES      #");
      log("  #  Nothing observed here says anything about a     #");
      log("  #  market. Results are a property of the price     #");
      log("  #  generator in marketData.ts, not of trading.     #");
      log("  ####################################################");
      log("");
      log("  no broker keys found. Create a .env next to package.json with");
      log("    ALPACA_KEY_ID / ALPACA_SECRET_KEY      for crypto and US equities");
      log("    OANDA_API_TOKEN / OANDA_ACCOUNT_ID     for spot FX");
      log("  then restart. See .env.example for the full list.");
      log("  On Windows check Notepad did not save it as .env.txt (dir /a .env*)");
      log("  Set REQUIRE_REAL_DATA=1 to make this a hard failure instead.");
    }
  });
})();
