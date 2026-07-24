// AI analyst — the "analyses the code and the trades" layer.
//
// This is the optional, judgment-oriented half of self-improvement. Where the
// optimizer tunes numbers deterministically, the analyst reads the actual
// strategy source code plus recent trading performance and returns a
// plain-English diagnosis and *code-level* improvement ideas (e.g. "add a
// volatility filter", "the RSI exit is too tight in trends").
//
// It calls the Claude API and is active only when ANTHROPIC_API_KEY is set;
// otherwise the platform runs on the deterministic optimizer alone. Code-level
// suggestions are always surfaced for human review — they are never applied to
// a running money bot automatically.

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import type {
  PerformanceStats,
  StrategyParams,
  Trade,
} from "@shared/schema";
import { STRATEGY_LIST } from "../trading/strategies";

export interface CodeSuggestion {
  strategyId: string;
  title: string;
  suggestion: string;
}

export interface AnalystReport {
  diagnosis: string;
  codeSuggestions: CodeSuggestion[];
}

export function analystAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Best-effort read of the strategy source so the model can reason about it. */
function readStrategySource(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "..", "trading", "strategies.ts"), "utf-8");
  } catch {
    return "(strategy source unavailable in this build)";
  }
}

interface AnalystInput {
  performance: PerformanceStats;
  recentTrades: Trade[];
  currentParams: Record<string, StrategyParams>;
  /** Per-strategy out-of-sample improvement the optimizer found (or ~0). */
  optimizerFindings: { strategyId: string; improvement: number }[];
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    diagnosis: {
      type: "string",
      description:
        "A concise, plain-English assessment of how the strategies are performing and why, grounded in the trades and stats provided.",
    },
    codeSuggestions: {
      type: "array",
      description:
        "Concrete, code-level improvement ideas for a human to review. Empty if nothing is worth changing.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          strategyId: { type: "string" },
          title: { type: "string" },
          suggestion: {
            type: "string",
            description:
              "What to change and why, at the level of the strategy's logic.",
          },
        },
        required: ["strategyId", "title", "suggestion"],
      },
    },
  },
  required: ["diagnosis", "codeSuggestions"],
} as const;

const SYSTEM = `You are a quantitative trading engineer reviewing an automated crypto trading system for a single retail user. You are given the strategy source code, recent live/paper performance, and the parameters currently in use. Your job is to diagnose how the strategies are doing and propose concrete, safe improvements at the level of the code and trading logic.

Be rigorous and skeptical of overfitting. Prefer robustness over chasing recent returns. Only suggest changes you can justify from the data or sound trading principles. It is completely fine to return no suggestions if nothing is clearly worth changing. Never recommend increasing risk limits or removing safety controls. Keep the diagnosis to a few sentences.`;

/**
 * Run the analyst. Returns null when no API key is configured or the call
 * fails — callers fall back to the optimizer-only path.
 */
export async function runAnalyst(
  input: AnalystInput,
): Promise<AnalystReport | null> {
  if (!analystAvailable()) return null;

  const client = new Anthropic();
  const strategyIds = STRATEGY_LIST.map((s) => s.meta.id);

  const userContent = [
    "STRATEGY SOURCE CODE:",
    "```typescript",
    readStrategySource(),
    "```",
    "",
    "VALID STRATEGY IDS: " + strategyIds.join(", "),
    "",
    "CURRENT PARAMETERS:",
    JSON.stringify(input.currentParams, null, 2),
    "",
    "OVERALL PERFORMANCE:",
    JSON.stringify(input.performance, null, 2),
    "",
    "OPTIMIZER OUT-OF-SAMPLE FINDINGS (improvement in return fraction):",
    JSON.stringify(input.optimizerFindings, null, 2),
    "",
    "RECENT TRADES (most recent first):",
    JSON.stringify(
      input.recentTrades.slice(0, 30).map((t) => ({
        strategy: t.strategy,
        returnPct: Number(t.returnPct.toFixed(4)),
        pnl: Number(t.pnl.toFixed(2)),
        reason: t.reason,
      })),
      null,
      2,
    ),
    "",
    "Diagnose performance and propose any code-level improvements. Use only the valid strategy ids above.",
  ].join("\n");

  try {
    // Built as a loose object so newer API fields (adaptive thinking, effort,
    // structured outputs) don't depend on the installed SDK's type version.
    const params: Record<string, unknown> = {
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
    };
    const response = (await client.messages.create(
      params as never,
    )) as Anthropic.Message;

    if (response.stop_reason === "refusal") return null;

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text.trim()) return null;

    const parsed = JSON.parse(text) as AnalystReport;
    // Keep only suggestions that reference a real strategy.
    parsed.codeSuggestions = (parsed.codeSuggestions ?? []).filter((s) =>
      strategyIds.includes(s.strategyId),
    );
    return parsed;
  } catch (err) {
    console.error("Analyst call failed:", (err as Error).message);
    return null;
  }
}
