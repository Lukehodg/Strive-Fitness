import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function serveStatic(app: Express) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), "public");
  if (!existsSync(directory)) throw new Error("Build the client before starting production.");
  app.use(express.static(directory));
  app.use("/api", (_req, res) => res.status(404).json({ message: "API endpoint not found." }));
  app.get("*", (_req, res) => res.sendFile(resolve(directory, "index.html")));
}
