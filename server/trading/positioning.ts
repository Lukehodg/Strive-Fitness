// OANDA publishes an aggregate, anonymized snapshot of its OWN clients'
// current open positions and resting orders per instrument — the "Position
// Book" and "Order Book". This is real, published sentiment data, not this
// bot's own trade history and not any other broker's — it is scoped to
// OANDA's client base only, and OANDA is one broker among many.
//
// Docs (OANDA v20 instrument API):
//   GET /v3/instruments/{instrument}/positionBook[?time=<RFC3339>]
//   GET /v3/instruments/{instrument}/orderBook[?time=<RFC3339>]
// Each bucket has longCountPercent / shortCountPercent — the percentage of
// ALL clients long/short at that price. Summed across every bucket, those
// give the total % of clients net long vs net short the instrument.
//
// How far back `time` can reach is not documented and is not guaranteed by
// this module — a request outside whatever window OANDA retains just comes
// back as a normal non-200 response, which fetchBook treats the same as any
// other failure (returns null; the caller skips that point rather than
// throwing). Nothing here feeds this data into strategy signals — it is
// exposed purely as raw data for the positioning report.

import { readOandaCredentials } from "./brokers";

export interface BookBucket {
  price: number;
  longCountPercent: number;
  shortCountPercent: number;
}

export interface BookSnapshot {
  instrument: string;
  time: string;
  price: number;
  bucketWidth: number;
  buckets: BookBucket[];
  /** Sum of every bucket's longCountPercent: % of OANDA clients net long this instrument. */
  netLongPercent: number;
  netShortPercent: number;
}

async function fetchBook(
  kind: "positionBook" | "orderBook",
  instrument: string,
  time?: string,
): Promise<BookSnapshot | null> {
  const creds = readOandaCredentials();
  if (!creds) return null;
  const url = new URL(`${creds.baseUrl}/v3/instruments/${instrument}/${kind}`);
  if (time) url.searchParams.set("time", time);

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${creds.token}` } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const raw = body?.[kind] as
    | { instrument: string; time: string; price: string; bucketWidth: string; buckets: unknown[] }
    | undefined;
  if (!raw?.buckets) return null;

  const buckets: BookBucket[] = raw.buckets.map((b) => {
    const bucket = b as { price: string; longCountPercent: string; shortCountPercent: string };
    return {
      price: Number(bucket.price),
      longCountPercent: Number(bucket.longCountPercent),
      shortCountPercent: Number(bucket.shortCountPercent),
    };
  });
  const netLongPercent = buckets.reduce((s, b) => s + b.longCountPercent, 0);
  const netShortPercent = buckets.reduce((s, b) => s + b.shortCountPercent, 0);

  return {
    instrument: raw.instrument,
    time: raw.time,
    price: Number(raw.price),
    bucketWidth: Number(raw.bucketWidth),
    buckets,
    netLongPercent,
    netShortPercent,
  };
}

export const fetchPositionBook = (instrument: string, time?: string) =>
  fetchBook("positionBook", instrument, time);
export const fetchOrderBook = (instrument: string, time?: string) => fetchBook("orderBook", instrument, time);

/**
 * RFC3339 timestamps spaced across the last `days` days, one every
 * `stepHours`, newest first (index 0 = now). Callers fetch each and drop
 * whichever OANDA doesn't have — see the module comment on retention.
 */
export function snapshotTimes(days: number, stepHours: number): string[] {
  const now = Date.now();
  const stepMs = stepHours * 60 * 60 * 1000;
  const count = Math.floor((days * 24) / stepHours);
  const times: string[] = [];
  for (let i = 0; i <= count; i++) {
    times.push(new Date(now - i * stepMs).toISOString());
  }
  return times;
}
