// Does news sentiment actually add anything?
//
//   npx tsx server/ml/newsAblation.ts                 # self-test, no keys
//   npx tsx server/ml/newsAblation.ts AAPL 180        # real news, needs keys
//
// The whole point of this file is that it is allowed to return "no". Adding a
// feature almost always raises IN-SAMPLE accuracy — that is what more
// parameters do — so the only question worth asking is whether it raises
// OUT-OF-SAMPLE accuracy by more than the noise in the estimate.
//
// So: same candles, same labels, same folds, same seed. The only difference is
// four extra columns. Then a paired comparison across folds, because the folds
// are the same folds — the paired test is far more sensitive than comparing
// two means, and it is the correct test given the design.
//
// SELF-TEST MODE exists because the instrument has to be checked before its
// readings mean anything. It runs two synthetic conditions with known answers:
//
//   NOISE   — news is random, uncorrelated with price. Must report NO edge.
//   LEAKED  — news encodes the future label. Must report a LARGE edge.
//
// A harness that cannot detect a planted edge is not evidence of absence, and
// one that finds an edge in pure noise is worse than useless. Both directions
// have to be demonstrated.

import { buildDataset, LABEL_HORIZON } from "./features";
import { purgedWalkForwardAccuracy } from "./cv";
import { tripleBarrierLabel, DEFAULT_TRIPLE_BARRIER } from "./labeling";
import { NewsTimeline, NEWS_FEATURE_NAMES } from "./newsFeatures";
import { generateSyntheticCandles } from "../trading/marketData";
import { readAlpacaCredentials } from "../trading/brokers";
import { fetchNews, scoreNews, type ScoredNews } from "../trading/news";
import type { Candle } from "@shared/schema";

const FOLDS = 5;

interface AblationResult {
  baseAuc: number;
  newsAuc: number;
  perFoldBase: number[];
  perFoldNews: number[];
  samples: number;
  headlines: number;
  /** Share of positive labels — reported so a lopsided dataset is visible. */
  baseRate: number;
}

/**
 * AUC — the probability that a randomly chosen positive is ranked above a
 * randomly chosen negative. Computed from ranks, so it is O(n log n).
 *
 * WHY NOT ACCURACY. The first version of this scored folds by accuracy and the
 * ablation came back byte-identical for every condition, including one with a
 * deliberately planted edge. The reason turned out to matter: the triple-barrier
 * labels here are ~70% positive, and the model's out-of-fold probabilities span
 * 0.564 to 0.822 — it predicts "up" on 100% of samples and never once crosses
 * the 0.5 threshold. Its "70.21% accuracy" IS the 70.10% base rate. Under those
 * conditions no feature can move accuracy at all, so accuracy cannot answer the
 * question being asked. (The live model already refuses to trade this case —
 * signalModel.isTradable() requires accuracy to beat baselineRate by a margin —
 * but a metric that reads identically for a good model and a constant one is
 * still the wrong instrument for an ablation.)
 *
 * AUC is threshold-free and rank-based, so it registers a probability ordering
 * getting better even while every prediction stays on one side of 0.5.
 */
function auc(pairs: Array<{ prob: number; label: number }>): number {
  const pos = pairs.filter((p) => p.label === 1).length;
  const neg = pairs.length - pos;
  if (!pos || !neg) return 0.5;

  const sorted = [...pairs].sort((a, b) => a.prob - b.prob);
  // Mid-ranks, so ties contribute 0.5 rather than depending on sort order.
  const ranks = new Array(sorted.length);
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].prob === sorted[i].prob) j++;
    const mid = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = mid;
    i = j + 1;
  }
  let rankSum = 0;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].label === 1) rankSum += ranks[i];
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

/**
 * Fold-by-fold AUC. purgedWalkForwardAccuracy returns every out-of-fold
 * prediction; the folds are recovered from them so the paired test has
 * something to pair.
 */
function foldAucs(X: number[][], y: number[]): { mean: number; perFold: number[] } {
  const { oof } = purgedWalkForwardAccuracy(X, y, { folds: FOLDS, purge: LABEL_HORIZON });
  // Out-of-fold predictions come back in index order, and each fold is one
  // contiguous validation block.
  const blockSize = Math.floor(X.length / (FOLDS + 1));
  const perFold: number[] = [];
  for (let f = 1; f <= FOLDS; f++) {
    const lo = f * blockSize;
    const hi = f === FOLDS ? X.length : lo + blockSize;
    const inFold = oof.filter((p) => p.index >= lo && p.index < hi);
    if (inFold.length < 20) continue;
    perFold.push(auc(inFold));
  }
  const mean = perFold.length ? perFold.reduce((a, v) => a + v, 0) / perFold.length : 0.5;
  return { mean, perFold };
}

function ablate(candles: Candle[], news: ScoredNews[]): AblationResult {
  const timeline = new NewsTimeline(news);
  const extra = candles.map((c) => timeline.featuresAt(c.time));

  const base = buildDataset(candles, DEFAULT_TRIPLE_BARRIER);
  const withNews = buildDataset(candles, DEFAULT_TRIPLE_BARRIER, extra);

  const b = foldAucs(base.X, base.y);
  const n = foldAucs(withNews.X, withNews.y);

  return {
    baseAuc: b.mean,
    newsAuc: n.mean,
    perFoldBase: b.perFold,
    perFoldNews: n.perFold,
    samples: base.X.length,
    headlines: news.length,
    baseRate: base.y.filter((v) => v === 1).length / base.y.length,
  };
}

/**
 * Paired t statistic over per-fold differences.
 *
 * With 5 folds this has 4 degrees of freedom, so |t| > 2.78 is p < 0.05
 * two-tailed. Reported as a raw threshold rather than a p-value because the
 * normality assumption is shaky at n=5 and a precise-looking p would overstate
 * what five numbers can support.
 */
function pairedT(a: number[], b: number[]): { t: number; meanDiff: number; n: number } {
  const n = Math.min(a.length, b.length);
  if (n < 2) return { t: 0, meanDiff: 0, n };
  const d = Array.from({ length: n }, (_, i) => b[i] - a[i]);
  const mean = d.reduce((x, v) => x + v, 0) / n;
  const varr = d.reduce((x, v) => x + (v - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(varr / n);
  return { t: se > 0 ? mean / se : 0, meanDiff: mean, n };
}

const CRITICAL_T = 2.78; // t(4), two-tailed, alpha = 0.05

function report(label: string, r: AblationResult): boolean {
  const { t, meanDiff } = pairedT(r.perFoldBase, r.perFoldNews);
  const significant = Math.abs(t) > CRITICAL_T && meanDiff > 0;

  console.log(`\n=== ${label} ===`);
  console.log(`  samples            ${r.samples}  (${(r.baseRate * 100).toFixed(1)}% positive)`);
  console.log(`  headlines          ${r.headlines}`);
  console.log(`  price only   AUC   ${r.baseAuc.toFixed(4)}  [${r.perFoldBase.map((x) => x.toFixed(3)).join(", ")}]`);
  console.log(`  price + news AUC   ${r.newsAuc.toFixed(4)}  [${r.perFoldNews.map((x) => x.toFixed(3)).join(", ")}]`);
  console.log(`  mean fold diff     ${meanDiff >= 0 ? "+" : ""}${meanDiff.toFixed(4)} AUC`);
  console.log(`  paired t           ${t.toFixed(2)}  (need |t| > ${CRITICAL_T} to clear noise)`);
  console.log(`  VERDICT            ${significant ? "news ADDS signal" : "no detectable edge — do not trade on it"}`);
  return significant;
}

// ---------------------------------------------------------------------------
// Synthetic news, for validating the instrument
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * News is planted ONE PER HOUR, which is roughly what a liquid name actually
 * gets and — more importantly — is the density these features are built for.
 *
 * The first version of this planted a headline every 5 bars encoding that
 * bar's own label, and the harness correctly reported no edge. That was the
 * test being wrong, not the harness: news_sent_1h is an hourly MEAN, so a
 * per-bar signal averages straight back to the base rate. It also should not
 * be detectable — a feature that could read a single bar's future from inside
 * an hour window would be lookahead, which is the thing this file exists to
 * avoid shipping.
 *
 * So the planted edge is hour-scale, matching what "news moves the next hour"
 * would actually look like: each headline encodes how the hour that FOLLOWS it
 * DEVIATES from the overall base rate, with 20% noise so a detected edge is
 * realistic rather than trivial.
 *
 * The deviation matters. Encoding the block's majority label was the second
 * wrong version of this test: these labels are ~70% positive, so the majority
 * is positive in nearly every hour and the "signal" was a constant. A planted
 * edge has to carry information the base rate does not already give away.
 */
const BARS_PER_HOUR = 60;

function syntheticNews(candles: Candle[], leak: boolean, seed = 7): ScoredNews[] {
  const rand = mulberry32(seed);
  const out: ScoredNews[] = [];

  // Global positive rate, so each block can be scored against it.
  let globalUp = 0;
  let globalSeen = 0;
  const labels: Array<number | null> = [];
  if (leak) {
    for (let j = 0; j < candles.length; j++) {
      const label = tripleBarrierLabel(candles, j, DEFAULT_TRIPLE_BARRIER);
      labels.push(label);
      if (label === null) continue;
      globalSeen++;
      if (label === 1) globalUp++;
    }
  }
  const globalRate = globalSeen ? globalUp / globalSeen : 0.5;

  for (let i = 0; i < candles.length; i += BARS_PER_HOUR) {
    let sentiment: number;
    if (leak) {
      let up = 0;
      let seen = 0;
      for (let j = i; j < Math.min(i + BARS_PER_HOUR, candles.length); j++) {
        const label = labels[j];
        if (label === null) continue;
        seen++;
        if (label === 1) up++;
      }
      if (!seen) continue;
      const truth = up / seen >= globalRate ? 1 : -1;
      sentiment = rand() < 0.8 ? truth : -truth;
    } else {
      sentiment = rand() * 2 - 1;
    }
    out.push({
      id: i,
      headline: leak ? "planted" : "noise",
      summary: "",
      // One second before the bar opens, so it is legitimately visible.
      createdAt: candles[i].time - 1000,
      symbols: ["TEST"],
      source: "synthetic",
      url: "",
      sentiment,
      matched: [],
    });
  }
  return out;
}

async function selfTest(): Promise<void> {
  console.log("SELF-TEST — validating the ablation harness against known answers.");
  console.log("News features:", NEWS_FEATURE_NAMES.join(", "));

  const candles = generateSyntheticCandles("TEST", 6000, Date.UTC(2026, 0, 15));

  const noiseOk = report("NOISE news (must find NO edge)", ablate(candles, syntheticNews(candles, false)));
  const leakOk = report("LEAKED news (must find a LARGE edge)", ablate(candles, syntheticNews(candles, true)));

  console.log("\n--- instrument check ---");
  const falsePositive = noiseOk;
  const falseNegative = !leakOk;
  console.log(`  no false positive on noise   ${falsePositive ? "FAIL" : "PASS"}`);
  console.log(`  detects a planted edge       ${falseNegative ? "FAIL" : "PASS"}`);
  if (falsePositive || falseNegative) {
    console.log("\nHARNESS IS NOT TRUSTWORTHY — do not read anything into a real run.");
    process.exit(1);
  }
  console.log("\nHarness validated: it reports edges that exist and not ones that don't.");
}

// ---------------------------------------------------------------------------
// Real run
// ---------------------------------------------------------------------------

async function realRun(symbol: string, days: number): Promise<void> {
  const creds = readAlpacaCredentials();
  if (!creds) {
    console.error("No ALPACA_KEY_ID / ALPACA_SECRET_KEY found. Add them to .env first.");
    process.exit(1);
  }

  const end = Date.now();
  const start = end - days * 86_400_000;
  console.log(`Fetching ${days}d of news for ${symbol}...`);
  const raw = await fetchNews(creds, [symbol], start, end);
  const news = raw.map(scoreNews);
  console.log(`  ${news.length} headlines, ${news.filter((n) => n.sentiment !== 0).length} scored non-neutral`);

  if (news.length < 50) {
    console.log("\nFewer than 50 headlines. Any result here is noise — widen the window.");
    process.exit(1);
  }

  const { createMarketFeed } = await import("../trading/marketData");
  const candles = await createMarketFeed().getCandles(symbol, Math.min(days * 24 * 60, 50_000));
  console.log(`  ${candles.length} candles`);

  report(`${symbol} — real news, ${days}d`, ablate(candles, news));
  console.log(
    "\nA negative verdict is the expected outcome and is worth having: it means\n" +
    "the feature stays out of the model rather than quietly adding variance.",
  );
}

const [symbolArg, daysArg] = process.argv.slice(2);
if (!symbolArg) {
  await selfTest();
} else {
  await realRun(symbolArg.toUpperCase(), Number(daysArg) || 180);
}
