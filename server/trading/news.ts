// Alpaca news feed and headline sentiment.
//
// WHY THIS SOURCE. The obvious idea is to scrape — Reuters, FlightRadar, X.
// Alpaca's news API is better for one reason that outweighs breadth: it has
// HISTORY. Sentiment you can only observe live cannot be backtested, and a
// trading signal you cannot backtest is a guess with extra steps. This endpoint
// serves the same Benzinga stream going years back, from the keys already
// configured, with no scraping and no terms-of-service problem.
//
// WHAT THE SENTIMENT SCORE IS. A finance-specific lexicon count, in the
// Loughran-McDonald tradition: general-purpose sentiment lists mis-score
// financial text badly ("liability", "tax", "crude" are not negative words in
// a 10-K sense). It is deliberately crude and deliberately transparent — you
// can read why any headline scored what it did. It is NOT a language model,
// and the honest expectation is a very small effect if any. That is precisely
// why ml/newsAblation.ts exists: nothing here is allowed to size a trade until
// the ablation shows it beats the same model without it.

const NEWS_URL = "https://data.alpaca.markets/v1beta1/news";

export interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  /** Epoch ms. */
  createdAt: number;
  symbols: string[];
  source: string;
  url: string;
}

export interface ScoredNews extends NewsItem {
  /** -1 (bad) .. +1 (good). 0 means nothing in the lexicon matched. */
  sentiment: number;
  /** Which words drove it, so a surprising score is explainable. */
  matched: string[];
}

// ---------------------------------------------------------------------------
// Lexicon
// ---------------------------------------------------------------------------

const POSITIVE = [
  "beat", "beats", "surge", "surges", "surged", "soar", "soars", "soared",
  "rally", "rallies", "jump", "jumps", "jumped", "gain", "gains", "climb",
  "climbs", "rise", "rises", "rose", "upgrade", "upgrades", "upgraded",
  "outperform", "outperforms", "record", "strong", "stronger", "growth",
  "profit", "profitable", "raises", "raised", "boost", "boosts", "boosted",
  "approval", "approved", "wins", "won", "expands", "expansion", "buyback",
  "dividend", "bullish", "optimistic", "exceeds", "exceeded", "topping",
  "breakthrough", "milestone", "accelerates", "recovery", "rebound",
];

const NEGATIVE = [
  "miss", "misses", "missed", "plunge", "plunges", "plunged", "slump",
  "slumps", "slumped", "fall", "falls", "fell", "drop", "drops", "dropped",
  "decline", "declines", "declined", "downgrade", "downgrades", "downgraded",
  "underperform", "weak", "weaker", "loss", "losses", "warning", "warns",
  "warned", "cuts", "cut", "slashes", "slashed", "lawsuit", "probe",
  "investigation", "recall", "bankruptcy", "default", "fraud", "halt",
  "halted", "layoffs", "layoff", "bearish", "concerns", "risk", "risks",
  "delays", "delayed", "shortfall", "subpoena", "fine", "fined", "penalty",
  "resign", "resigns", "resigned", "sinks", "sank", "tumble", "tumbles",
  "tumbled", "selloff", "crash", "collapse",
];

/**
 * Negators. "not strong" and "fails to beat" invert the word that follows;
 * without this the lexicon reads them as bullish, which is worse than neutral
 * because it is confidently backwards.
 */
const NEGATORS = new Set(["not", "no", "never", "fails", "fail", "failed", "without", "cannot", "isnt", "wasnt", "doesnt", "dont"]);

const POS = new Set(POSITIVE);
const NEG = new Set(NEGATIVE);

/**
 * Score one piece of text in [-1, 1].
 *
 * Normalised by the number of MATCHED words rather than total length, so a
 * long neutral summary does not dilute a clearly negative headline to nothing.
 */
export function scoreText(text: string): { sentiment: number; matched: string[] } {
  const words = text.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(Boolean);
  let sum = 0;
  let hits = 0;
  const matched: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/'/g, "");
    const isPos = POS.has(w);
    const isNeg = NEG.has(w);
    if (!isPos && !isNeg) continue;
    // Look back two words for a negator.
    const negated = [words[i - 1], words[i - 2]]
      .some((p) => p && NEGATORS.has(p.replace(/'/g, "")));
    const value = (isPos ? 1 : -1) * (negated ? -1 : 1);
    sum += value;
    hits++;
    matched.push(negated ? `not-${w}` : w);
  }

  return { sentiment: hits ? sum / hits : 0, matched };
}

/**
 * Score a news item. The headline carries most of the signal and the summary
 * is often boilerplate, so the headline is weighted 2:1.
 */
export function scoreNews(item: NewsItem): ScoredNews {
  const h = scoreText(item.headline);
  const s = scoreText(item.summary ?? "");
  const weight = h.matched.length * 2 + s.matched.length;
  const sentiment = weight
    ? (h.sentiment * h.matched.length * 2 + s.sentiment * s.matched.length) / weight
    : 0;
  return { ...item, sentiment, matched: [...h.matched, ...s.matched] };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export interface NewsCredentials {
  keyId: string;
  secretKey: string;
}

/** Alpaca returns at most 50 per page; anything larger is silently clamped. */
const PAGE_LIMIT = 50;

/**
 * Fetch news for `symbols` between two instants, following pagination.
 *
 * `maxPages` is a hard stop, not a suggestion. A two-year backfill across 40
 * symbols is tens of thousands of articles, and an unbounded loop against a
 * rate-limited endpoint is how you get the key throttled mid-session.
 */
export async function fetchNews(
  creds: NewsCredentials,
  symbols: string[],
  start: number,
  end: number,
  maxPages = 40,
): Promise<NewsItem[]> {
  // Crypto pairs are "BTC/USD" on the market-data API but "BTCUSD" on news.
  const query = symbols.map((s) => s.replace("/", "")).join(",");
  const out: NewsItem[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(NEWS_URL);
    url.searchParams.set("symbols", query);
    url.searchParams.set("start", new Date(start).toISOString());
    url.searchParams.set("end", new Date(end).toISOString());
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("sort", "asc");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await fetch(url, {
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secretKey,
      },
    });
    if (!res.ok) {
      throw new Error(`Alpaca news ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      news?: Array<{
        id: number; headline: string; summary: string; created_at: string;
        symbols: string[]; source: string; url: string;
      }>;
      next_page_token?: string | null;
    };

    for (const n of body.news ?? []) {
      out.push({
        id: n.id,
        headline: n.headline ?? "",
        summary: n.summary ?? "",
        createdAt: Date.parse(n.created_at),
        symbols: n.symbols ?? [],
        source: n.source ?? "",
        url: n.url ?? "",
      });
    }

    if (!body.next_page_token) break;
    pageToken = body.next_page_token;
  }

  return out.sort((a, b) => a.createdAt - b.createdAt);
}

// ---------------------------------------------------------------------------
// Live cache for the trading loop
// ---------------------------------------------------------------------------

interface CacheEntry {
  fetchedAt: number;
  items: ScoredNews[];
}

const cache = new Map<string, CacheEntry>();
/** News is not tick data. Refetching every 15s just burns the rate limit. */
const CACHE_MS = 5 * 60_000;

/**
 * Recent scored news for one symbol, cached.
 *
 * Returns [] rather than throwing when the feed is unreachable: a news outage
 * must not stop the bot trading, it just means this input is unavailable.
 */
export async function recentNews(
  creds: NewsCredentials,
  symbol: string,
  lookbackHours = 24,
  now = Date.now(),
): Promise<ScoredNews[]> {
  const hit = cache.get(symbol);
  if (hit && now - hit.fetchedAt < CACHE_MS) return hit.items;
  try {
    const raw = await fetchNews(creds, [symbol], now - lookbackHours * 3_600_000, now, 2);
    const items = raw.map(scoreNews);
    cache.set(symbol, { fetchedAt: now, items });
    return items;
  } catch {
    return hit?.items ?? [];
  }
}

/** For tests and for forcing a refetch after a config change. */
export function clearNewsCache(): void {
  cache.clear();
}
