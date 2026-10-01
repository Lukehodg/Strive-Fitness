import express, { type ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { registerRoutes } from "./routes";
import type { ProviderFetch } from "./wearable-providers";
import type { MailFetch } from "./mail-providers";

export async function createApp(
  options: { wearableFetch?: ProviderFetch; mailFetch?: MailFetch } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ status: "ok" }); });
  app.get("/readyz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    void db.execute(sql`select 1 from scheduled_workouts, session_feedback limit 0`).then(() => res.json({ status: "ready" })).catch(() => res.status(503).json({ status: "unavailable" }));
  });
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(express.json({ limit: "256kb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  const server = await registerRoutes(app, options);
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        message: "Invalid input.",
        fields: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    const code = error?.code || error?.cause?.code;
    if (code === "23503")
      return res.status(409).json({
        message:
          "This record is referenced by another record. Preserve its history before removing it.",
      });
    if (code === "23505")
      return res.status(409).json({ message: "This record already exists." });
    const status = Number(error?.status) || 500;
    // Never log request bodies, cookies, health observations or database parameters.
    if (status >= 500)
      console.error("Request failed", {
        kind: error?.name || "Error",
        code: code || "unknown",
      });
    res.status(status).json({
      message:
        status >= 500 ? "Something went wrong. Please retry." : error.message,
    });
  };
  app.use(errors);
  return { app, server };
}
