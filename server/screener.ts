// Reads the fundamental screen produced by `screener/screen.py`.
//
// The screen answers "which stocks are worth trading at all?", never "when".
// Fundamentals move quarterly; the engine trades minute bars. Keeping those
// two concerns apart is deliberate — see screener/screen.py for the reasoning.

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SCREEN_PATH = join(process.cwd(), "data", "screen.json");

export interface ScreenEntry {
  rank: number;
  symbol: string;
  score: number;
  metrics: Record<string, number | null>;
}

export interface ScreenResult {
  generatedAt: string;
  source: string;
  universe: string[];
  ranked: ScreenEntry[];
  note: string;
  /** Age in hours; fundamentals are quarterly, but a very stale file is a smell. */
  ageHours: number | null;
}

/** Load the latest screen, or null when the screener has never been run. */
export function loadScreen(): ScreenResult | null {
  try {
    if (!existsSync(SCREEN_PATH)) return null;
    const raw = JSON.parse(readFileSync(SCREEN_PATH, "utf-8"));
    if (!Array.isArray(raw?.ranked)) return null;
    const mtime = statSync(SCREEN_PATH).mtimeMs;
    return {
      generatedAt: raw.generatedAt ?? new Date(mtime).toISOString(),
      source: raw.source ?? "unknown",
      universe: Array.isArray(raw.universe) ? raw.universe : [],
      ranked: raw.ranked,
      note: raw.note ?? "",
      ageHours: (Date.now() - mtime) / 3_600_000,
    };
  } catch {
    return null;
  }
}

/** Top-ranked symbols, best first. Empty when no screen has been run. */
export function screenedSymbols(limit = 10): string[] {
  const screen = loadScreen();
  if (!screen) return [];
  return screen.ranked
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((r) => r.symbol);
}
