// File-based persistence: the platform's state survives restarts.
//
// A real trading program never loses its book on restart. For a single-user
// tool, a JSON snapshot on disk delivers that with zero infrastructure: every
// state mutation schedules a debounced atomic write of the full snapshot to
// data/state.json, which is restored on the next boot. (A database can replace
// this later without touching the callers — the provider interface below is
// the seam.)
//
// Modules that own state register a provider (serialize) and a restorer
// (deserialize). This module never imports them, avoiding import cycles.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const STATE_PATH = join(DATA_DIR, "state.json");
/** Collapse bursts of mutations into one write. */
const DEBOUNCE_MS = 2_000;
/** Backstop interval save in case a debounce timer is lost. */
const BACKSTOP_MS = 30_000;

type Provider = () => unknown;
type Restorer = (data: unknown) => void;

const providers = new Map<string, Provider>();
const restorers = new Map<string, Restorer>();
let timer: NodeJS.Timeout | null = null;
let dirty = false;
let started = false;

export function registerPersistence(
  name: string,
  provider: Provider,
  restorer: Restorer,
): void {
  providers.set(name, provider);
  restorers.set(name, restorer);
}

function snapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = { savedAt: Date.now() };
  for (const [name, provider] of providers) {
    try {
      out[name] = provider();
    } catch (err) {
      console.error(`persistence: provider ${name} failed:`, err);
    }
  }
  return out;
}

function writeNow(): void {
  dirty = false;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_PATH + ".tmp";
    writeFileSync(tmp, JSON.stringify(snapshot()));
    renameSync(tmp, STATE_PATH); // atomic on the same filesystem
  } catch (err) {
    console.error("persistence: write failed:", err);
  }
}

/** Mark state dirty; a debounced write follows shortly. */
export function schedulePersist(): void {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (dirty) writeNow();
  }, DEBOUNCE_MS);
}

/**
 * Restore state from disk into all registered restorers, then start the
 * backstop timer and exit hooks. Call once at boot after every state-owning
 * module has registered.
 */
export function initPersistence(): boolean {
  if (started) return false;
  started = true;

  let restored = false;
  if (existsSync(STATE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as Record<string, unknown>;
      for (const [name, restorer] of restorers) {
        if (name in raw) {
          try {
            restorer(raw[name]);
            restored = true;
          } catch (err) {
            console.error(`persistence: restore ${name} failed:`, err);
          }
        }
      }
    } catch (err) {
      console.error("persistence: could not read state file:", err);
    }
  }

  setInterval(() => {
    if (dirty) writeNow();
  }, BACKSTOP_MS).unref();

  // Flush on shutdown so the last few seconds of state aren't lost.
  const flush = () => {
    if (dirty) writeNow();
  };
  process.on("SIGINT", () => {
    flush();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    flush();
    process.exit(0);
  });
  process.on("beforeExit", flush);

  return restored;
}
