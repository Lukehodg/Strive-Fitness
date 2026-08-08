// Spot FX: pair specifications, sessions, spreads and overnight carry.
//
// WHY FOREX AT ALL. Execution cost is the binding constraint on this system,
// not signal quality. A crypto taker round trip costs 0.60% once priced
// honestly (see costs.ts); against the day profile's 4% target that is 15% of
// the gross consumed before being right about anything. Spot FX on the majors
// costs roughly 0.01% round trip — around SIXTY times cheaper. That does not
// create an edge, but it stops a small one being eaten.
//
// ---------------------------------------------------------------------------
// THE ONE DESIGN DECISION EVERYTHING ELSE FOLLOWS FROM
// ---------------------------------------------------------------------------
//
// Every pair here is traded in its XXX/USD form, inverting the market's
// conventional quote where necessary. USD/JPY is traded as JPY/USD.
//
// This is not cosmetic — it is what makes FX safe to bolt onto an engine built
// for stocks and crypto. The entire codebase assumes two identities:
//
//     notional in USD  =  qty * price
//     P&L in USD       =  (exit - entry) * qty
//
// For a XXX/USD pair both hold exactly: quantity is units of XXX, price is the
// USD value of one unit, so the arithmetic is indistinguishable from a share
// priced in dollars. For a USD/XXX pair NEITHER holds — quantity is units of
// USD and the price move accrues in XXX, so P&L lands in the wrong currency
// and has to be converted at the exit rate.
//
// The alternative was to thread a currency-conversion helper through the
// backtester, the brokers, the sizing path and the engine's P&L. That is four
// edits to the most safety-critical arithmetic in the project, each one a
// place to be silently wrong about money, and none of it verifiable here
// without a live FX feed. Inverting at the feed boundary instead is one edit
// in one place, and it makes every downstream identity exact rather than
// approximately right.
//
// Long JPY/USD is short USD/JPY. That is a real economic position, not a
// notational trick: you are long yen. A 1% rise in JPY/USD is a ~1% fall in
// USD/JPY, and the fractional spread is invariant under inversion (to first
// order, d(1/x)/(1/x) = -dx/x), so the cost model carries over unchanged.
//
// The cost of this choice is that the UI shows JPY/USD where a trader expects
// USD/JPY. `conventional()` exists so anything user-facing can show both.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT HERE
// ---------------------------------------------------------------------------
//
// LEVERAGE. FX brokers offer 30:1 and up. This module exposes none of it: a
// position is sized in units and the existing maxPositionPct ceiling applies
// to USD notional exactly as it does for equities. The whole value of FX here
// is the cheap spread; the leverage is what turns a small account into a
// margin call, and the sizing controls in sizing.ts and portfolio.ts only mean
// what they say while exposure stays unlevered.
//
// CROSSES. GBP/JPY, EUR/GBP and friends are recognised by isForexSymbol so
// they cannot be mistaken for crypto, but they are NOT tradeable: neither leg
// is USD, so the invert-to-XXX/USD trick does not apply and the P&L identity
// breaks again. tradeablePairs() is the allowlist; assertTradeable() is the
// guard.

// ---------------------------------------------------------------------------
// Currency classification
// ---------------------------------------------------------------------------

/**
 * ISO 4217 codes we recognise as currencies.
 *
 * This set is what stops "EUR/USD" being classified as crypto. Both legs of a
 * slash-separated symbol must be in here for it to be FX; "BTC/USD" fails
 * because BTC is not a currency code, so it stays crypto. That test is the
 * whole disambiguation, and it is why the set must not be widened to include
 * anything a crypto venue also lists.
 */
const CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
  "SEK", "NOK", "DKK", "SGD", "HKD", "MXN", "ZAR", "PLN",
  "CZK", "HUF", "TRY", "CNH", "ILS", "THB",
]);

/** True when both legs are ISO currency codes — i.e. this is an FX pair. */
export function isForexSymbol(symbol: string): boolean {
  const parts = symbol.split("/");
  if (parts.length !== 2) return false;
  return CURRENCIES.has(parts[0]) && CURRENCIES.has(parts[1]) && parts[0] !== parts[1];
}

// ---------------------------------------------------------------------------
// Pair specifications
// ---------------------------------------------------------------------------

export interface PairSpec {
  /** Traded symbol, always XXX/USD. */
  symbol: string;
  /** How the market quotes it, e.g. "USD/JPY" for the JPY/USD we trade. */
  conventional: string;
  /** True when `conventional` is USD/XXX and the feed price must be inverted. */
  inverted: boolean;
  /** Pip size in the CONVENTIONAL quote currency (0.01 for JPY pairs). */
  pipSize: number;
  /**
   * Typical retail spread in pips, on the conventional quote.
   *
   * Deliberately at the wide end of what a retail account sees in liquid
   * hours, not the marketing headline. Spreads widen at the daily rollover, in
   * the Asian session and around releases; a model calibrated on the tightest
   * possible quote manufactures an edge that the fills will not honour. Every
   * value here is overridable — calibrate against your own statements.
   */
  spreadPips: number;
  /** Conventional-quote price used when no live price is available. */
  referencePrice: number;
}

/**
 * The seven major pairs. Keyed by TRADED symbol (always XXX/USD).
 *
 * Only majors, deliberately. The cost argument for FX rests entirely on the
 * spread, and the spread on a minor or an EM pair is five to fifty times wider
 * — USD/TRY at 100+ pips is more expensive than the crypto this exists to
 * escape. Seven liquid pairs is also enough for the diversification the
 * portfolio limits are built around.
 */
const SPECS: PairSpec[] = [
  { symbol: "EUR/USD", conventional: "EUR/USD", inverted: false, pipSize: 0.0001, spreadPips: 1.0, referencePrice: 1.08 },
  { symbol: "GBP/USD", conventional: "GBP/USD", inverted: false, pipSize: 0.0001, spreadPips: 1.5, referencePrice: 1.27 },
  { symbol: "AUD/USD", conventional: "AUD/USD", inverted: false, pipSize: 0.0001, spreadPips: 1.5, referencePrice: 0.66 },
  { symbol: "NZD/USD", conventional: "NZD/USD", inverted: false, pipSize: 0.0001, spreadPips: 2.0, referencePrice: 0.61 },
  // Conventionally quoted USD-base; we trade the inverse so notional and P&L
  // land in USD without a conversion step. See the header.
  { symbol: "JPY/USD", conventional: "USD/JPY", inverted: true, pipSize: 0.01, spreadPips: 1.0, referencePrice: 157.0 },
  { symbol: "CHF/USD", conventional: "USD/CHF", inverted: true, pipSize: 0.0001, spreadPips: 2.0, referencePrice: 0.88 },
  { symbol: "CAD/USD", conventional: "USD/CAD", inverted: true, pipSize: 0.0001, spreadPips: 2.0, referencePrice: 1.37 },
];

const BY_SYMBOL = new Map(SPECS.map((s) => [s.symbol, s]));

/** Spec for a traded symbol, or undefined if it is not a tradeable pair. */
export function pairSpec(symbol: string): PairSpec | undefined {
  return BY_SYMBOL.get(symbol);
}

/** Every tradeable FX symbol, in XXX/USD form. */
export function tradeablePairs(): string[] {
  return SPECS.map((s) => s.symbol);
}

/** How the market quotes this symbol, for display. Identity for non-FX. */
export function conventional(symbol: string): string {
  return BY_SYMBOL.get(symbol)?.conventional ?? symbol;
}

/**
 * Throw if an FX symbol is not one we can trade correctly.
 *
 * A cross like GBP/JPY passes isForexSymbol (so it is not misfiled as crypto)
 * but has no USD leg, so neither the notional nor the P&L identity holds for
 * it. Failing loudly here is the difference between "unsupported pair" and a
 * position whose profit is silently denominated in the wrong currency.
 */
export function assertTradeable(symbol: string): void {
  if (!isForexSymbol(symbol)) return;
  if (BY_SYMBOL.has(symbol)) return;
  const inverse = symbol.split("/").reverse().join("/");
  const hint = BY_SYMBOL.has(inverse)
    ? ` Trade it as ${inverse} — this platform quotes every pair against USD.`
    : " Only USD majors are supported; crosses have no USD leg to settle into.";
  throw new Error(`${symbol} is not a tradeable FX pair.${hint}`);
}

// ---------------------------------------------------------------------------
// Spread
// ---------------------------------------------------------------------------

/** Per-pair spread overrides in pips, from config. */
let spreadOverrides: Record<string, number> = {};

export function setSpreadOverrides(next: Record<string, number> | undefined): void {
  spreadOverrides = next ?? {};
}

/** Spread in pips currently in force for a pair. */
export function spreadPipsFor(symbol: string): number {
  const spec = BY_SYMBOL.get(symbol);
  if (!spec) return 0;
  const override = spreadOverrides[symbol];
  return typeof override === "number" && Number.isFinite(override) && override >= 0
    ? override
    : spec.spreadPips;
}

/**
 * The FULL spread as a fraction of price, at the given traded price.
 *
 * Pips are denominated in the conventional quote, so for an inverted pair the
 * conventional price is 1/tradedPrice and the fraction works out as
 * pips * pipSize * tradedPrice. Both branches reduce to "spread over price"
 * expressed in the same currency, which is what makes the fraction invariant
 * under inversion.
 */
export function spreadFractionAt(symbol: string, tradedPrice?: number): number {
  const spec = BY_SYMBOL.get(symbol);
  if (!spec) return 0;
  const spread = spreadPipsFor(symbol) * spec.pipSize;
  const conventionalPrice =
    tradedPrice && tradedPrice > 0
      ? spec.inverted
        ? 1 / tradedPrice
        : tradedPrice
      : spec.referencePrice;
  if (!(conventionalPrice > 0)) return 0;
  return spread / conventionalPrice;
}

/**
 * Cost of crossing the spread ONE way, as a fraction.
 *
 * Half the quoted spread, because a fill happens at bid or ask while positions
 * are marked at mid. Entry costs half and exit costs half, so a round trip
 * pays exactly one full spread — which is the number a broker's spread table
 * is actually quoting.
 */
export function halfSpreadFraction(symbol: string, tradedPrice?: number): number {
  return spreadFractionAt(symbol, tradedPrice) / 2;
}

// ---------------------------------------------------------------------------
// Overnight carry (swap)
// ---------------------------------------------------------------------------

/**
 * Annualised financing cost charged on a position held through the 17:00 ET
 * rollover, as a fraction of notional.
 *
 * DELIBERATELY MODELLED AS A PURE COST rather than as an interest differential.
 *
 * The honest reason: a real swap is (base rate - quote rate) plus a broker
 * markup, and I do not know today's policy rates. Inventing them would put a
 * number in the P&L that looks precise and is not — and half the time it would
 * invent a CREDIT, which is exactly the direction that manufactures an edge.
 * Assuming the differential is zero and that you pay the markup either way is
 * the conservative reading: it can understate a carry trade's return, but it
 * can never fabricate one.
 *
 * Override it per pair once you have statements showing what you are actually
 * charged. A positive value is a cost; a negative value is a credit.
 */
const DEFAULT_CARRY_ANNUAL = 0.015;

let carryOverrides: Record<string, number> = {};
let carryAnnualDefault = DEFAULT_CARRY_ANNUAL;

export function setCarryRates(
  next: Record<string, number> | undefined,
  defaultAnnual?: number | null,
): void {
  carryOverrides = next ?? {};
  carryAnnualDefault =
    typeof defaultAnnual === "number" && Number.isFinite(defaultAnnual)
      ? defaultAnnual
      : DEFAULT_CARRY_ANNUAL;
}

/** Annualised carry cost for holding this pair long. */
export function carryAnnualFor(symbol: string): number {
  if (!BY_SYMBOL.has(symbol)) return 0;
  const override = carryOverrides[symbol];
  return typeof override === "number" && Number.isFinite(override)
    ? override
    : carryAnnualDefault;
}

/**
 * Carry charged at one rollover, as a fraction of notional.
 *
 * Wednesday's rollover carries THREE days because spot settles T+2 and the
 * value date rolls over the weekend. Missing this understates the cost of a
 * position held across a Wednesday by two days' financing — small per trade,
 * but it is a systematic bias and it always points the same way.
 */
export function carryAtRollover(symbol: string, rolloverInstant: number): number {
  const annual = carryAnnualFor(symbol);
  if (!annual) return 0;
  const days = etWeekday(rolloverInstant) === 3 ? 3 : 1;
  return (annual / 365) * days;
}

// ---------------------------------------------------------------------------
// Sessions
//
// FX is 24/5, not 24/7 and not 09:30-16:00. The week opens Sunday 17:00 ET and
// runs unbroken to Friday 17:00 ET. Treating it as 24/7 (the crypto path)
// would fire orders into a shut market all weekend; treating it as an equity
// session would stand the bot down for two thirds of the week it should be
// trading.
// ---------------------------------------------------------------------------

const ET = "America/New_York";
const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function etFields(ms: number): { dow: number; hour: number; minute: number } {
  const parts = Object.fromEntries(etFmt.formatToParts(ms).map((p) => [p.type, p.value]));
  return {
    dow: DOW[String(parts.weekday)] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function etWeekday(ms: number): number {
  return etFields(ms).dow;
}

/** Minutes since Sunday 00:00 ET. */
function etWeekMinute(ms: number): number {
  const f = etFields(ms);
  return f.dow * 1440 + f.hour * 60 + f.minute;
}

/** Sunday 17:00 ET, in minutes since Sunday 00:00 ET. */
const WEEK_OPEN = 0 * 1440 + 17 * 60;
/** Friday 17:00 ET. */
const WEEK_CLOSE = 5 * 1440 + 17 * 60;

/** True when the FX market is open at this instant. */
export function isForexOpen(now = Date.now()): boolean {
  const wm = etWeekMinute(now);
  return wm >= WEEK_OPEN && wm < WEEK_CLOSE;
}

/**
 * The daily rollover window, when spreads widen to several times normal and
 * liquidity all but disappears for a few minutes around 17:00 ET.
 *
 * Entries are blocked through it. This is the same logic as the event
 * blackout: not a prediction, just declining to cross a spread that is
 * temporarily five times its usual width. Exits are never blocked — an exit
 * that does not happen is a risk failure, not a saving.
 */
const ROLLOVER_FROM = 16 * 60 + 55;
const ROLLOVER_TO = 17 * 60 + 15;

export function inRolloverWindow(now = Date.now()): boolean {
  const f = etFields(now);
  const m = f.hour * 60 + f.minute;
  return m >= ROLLOVER_FROM && m < ROLLOVER_TO;
}

/**
 * When the current FX week ends, for the day profile's flatten-before-close
 * rule. Null when the market is shut.
 *
 * The relevant "close" for FX is the Friday one: that is the only time the
 * market genuinely stops and a position is exposed to a two-day gap it cannot
 * be stopped out of. The daily rollover is a liquidity trough, not a close.
 */
export function forexSessionCloseAt(now = Date.now()): number | null {
  if (!isForexOpen(now)) return null;
  const wm = etWeekMinute(now);
  return now + (WEEK_CLOSE - wm) * 60_000;
}

/**
 * The next rollover instant at or after `now`, for accruing carry. Returns
 * null when the market is shut (no rollover happens over the weekend; the
 * Friday close already charged for it via the Wednesday triple).
 */
export function nextRollover(now = Date.now()): number | null {
  if (!isForexOpen(now)) return null;
  const f = etFields(now);
  const minutesNow = f.hour * 60 + f.minute;
  const target = 17 * 60;
  const delta = minutesNow < target ? target - minutesNow : 1440 - minutesNow + target;
  return now + delta * 60_000;
}

// ---------------------------------------------------------------------------
// Order granularity
// ---------------------------------------------------------------------------

/**
 * Smallest tradeable quantity, in units of the base currency.
 *
 * One unit, which is what OANDA and the other units-based brokers accept.
 * This is the reason FX is viable on a small account at all: a lot-based
 * broker forces a 1,000-unit micro lot (~£850 of EUR/USD), which on a £100
 * account is 9x leverage before any position sizing has happened. At one-unit
 * granularity the sizing controls in sizing.ts keep working unchanged.
 */
export const MIN_UNITS = 1;

/** Round a quantity to whole units. FX venues do not take fractional units. */
export function roundUnits(qty: number): number {
  return Math.floor(qty);
}
