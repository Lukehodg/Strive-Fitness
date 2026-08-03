// Turning a news stream into per-bar features.
//
// THE ONLY HARD PART IS ALIGNMENT. A headline timestamped 14:32:07 must not be
// visible to the model at the 14:32 bar — that bar's close is 14:32:59, but
// the decision is made ON the close, and in live trading you would not have
// acted on 14:32:07 news until the 14:33 bar anyway. More importantly the
// naive join (bucket news by bar, attach to that bar) leaks systematically:
// price-moving news and the price move it caused land in the SAME bucket, so
// the model learns "big sentiment now = big move now" and scores brilliantly
// in backtest and nothing live.
//
// So every feature here reads news STRICTLY BEFORE the bar's open, never
// including it. That is conservative by one bar and it is the difference
// between a measurement and a fantasy.

import type { Candle } from "@shared/schema";
import type { ScoredNews } from "../trading/news";

/** Feature names, in emission order. Appended after the price features. */
export const NEWS_FEATURE_NAMES = [
  "news_sent_1h", // mean sentiment of headlines in the hour before the bar
  "news_sent_24h", // mean sentiment over the previous 24h — slower backdrop
  "news_count_1h", // headline volume, log-scaled; attention, not direction
  "news_recency", // how fresh the last headline is, 1 = just now, 0 = stale
] as const;

export const NEWS_FEATURE_COUNT = NEWS_FEATURE_NAMES.length;

/** All zeros — the reading when there is no news at all. */
export const NEWS_FEATURES_ABSENT: number[] = new Array(NEWS_FEATURE_COUNT).fill(0);

const HOUR = 3_600_000;

/**
 * A news stream indexed for fast "everything strictly before t" queries.
 *
 * Built once per symbol. Without it, building features for 50k bars against
 * 20k headlines is a 10^9-operation scan; with a sorted array and a moving
 * cursor it is linear.
 */
export class NewsTimeline {
  private items: ScoredNews[];

  constructor(items: ScoredNews[]) {
    this.items = [...items].sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Index of the first item at or after `t` — i.e. the exclusive upper bound. */
  private lowerBound(t: number): number {
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].createdAt < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Features for a bar that OPENS at `barOpenTime`.
   *
   * Everything is computed from news with createdAt < barOpenTime. News inside
   * the bar is excluded — see the header for why that is the whole point.
   */
  featuresAt(barOpenTime: number): number[] {
    const end = this.lowerBound(barOpenTime);
    if (end === 0) return NEWS_FEATURES_ABSENT.slice();

    const start1h = this.lowerBound(barOpenTime - HOUR);
    const start24h = this.lowerBound(barOpenTime - 24 * HOUR);

    let sum1h = 0;
    for (let i = start1h; i < end; i++) sum1h += this.items[i].sentiment;
    const n1h = end - start1h;

    let sum24h = 0;
    for (let i = start24h; i < end; i++) sum24h += this.items[i].sentiment;
    const n24h = end - start24h;

    const lastAt = this.items[end - 1].createdAt;
    const ageHours = (barOpenTime - lastAt) / HOUR;

    return [
      n1h ? sum1h / n1h : 0,
      n24h ? sum24h / n24h : 0,
      // Log-scaled: the difference between 0 and 3 headlines matters, the
      // difference between 40 and 43 does not.
      Math.log1p(n1h) / Math.log(21),
      // Decays to ~0 over a day, so "nothing for a week" and "nothing for a
      // month" read the same, which they should.
      Math.exp(-ageHours / 6),
    ];
  }

  get size(): number {
    return this.items.length;
  }
}

/**
 * News features for every candle, aligned by open time.
 *
 * Candles carry `time` as the bar's OPEN, which is what makes the strict
 * `< barOpenTime` bound correct: at the moment that bar opens, only earlier
 * news exists.
 */
export function newsFeatureMatrix(candles: Candle[], timeline: NewsTimeline): number[][] {
  return candles.map((c) => timeline.featuresAt(c.time));
}
