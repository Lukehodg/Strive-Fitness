// Asset-class rules. Crypto and US equities differ in ways that silently
// corrupt behaviour if you treat them the same: different market-data
// endpoints, different symbol spellings per API, different order types, and —
// unlike crypto — equities are closed most of the time.

import { conventional, isForexSymbol, roundUnits } from "./forex";

export type AssetClass = "crypto" | "stock" | "forex";

/**
 * Crypto pairs are quoted with a slash ("BTC/USD", "ETH/USD"); equities are
 * bare tickers ("AAPL", "SPY"). Neither is tradeable here — this platform
 * trades spot FX only — but the classification still matters, because the
 * comparison tools and the synthetic generator both run per asset class.
 *
 * FX BREAKS THAT TEST, which is why the currency check comes first. "EUR/USD"
 * is slash-separated too, so the original rule classified every FX pair as
 * crypto — and would have charged it a 0.25% crypto taker fee, routed it to
 * the crypto bars endpoint, and told the engine it trades 24/7 through the
 * weekend. isForexSymbol requires BOTH legs to be ISO currency codes, which
 * "BTC/USD" fails on its first leg, so crypto is unaffected.
 */
export function assetClassOf(symbol: string): AssetClass {
  if (isForexSymbol(symbol)) return "forex";
  return symbol.includes("/") ? "crypto" : "stock";
}

/**
 * The symbol without its separator ("BTCUSD"), which is how some venues key
 * positions. Retained because the engine reconciles broker-reported position
 * symbols against the configured universe through it.
 */
export function positionSymbol(symbol: string): string {
  return assetClassOf(symbol) === "crypto" ? symbol.replace("/", "") : symbol;
}

/**
 * The instrument name OANDA expects: underscore-separated ("EUR_USD"), and
 * always in the MARKET'S conventional direction — there is no such instrument
 * as JPY_USD. Callers therefore translate both the separator and, for inverted
 * pairs, the direction. See forex.ts for why we trade the inverted form.
 */
export function venueSymbol(symbol: string): string {
  if (assetClassOf(symbol) !== "forex") return positionSymbol(symbol);
  return conventional(symbol).replace("/", "_");
}

/**
 * Time-in-force. Equity orders are scoped to the session ("day") so nothing
 * survives overnight into a gap; crypto trades continuously so "gtc" is right.
 *
 * FX takes "gtc" for the same reason crypto does, but for a narrower window:
 * the market runs unbroken from Sunday evening to Friday evening, so a
 * "day" order would expire at an arbitrary point inside a live session.
 */
export function timeInForce(symbol: string): "day" | "gtc" {
  return assetClassOf(symbol) === "stock" ? "day" : "gtc";
}

// ---------------------------------------------------------------------------
// Per-asset-class volatility — the single source of truth
// ---------------------------------------------------------------------------

/**
 * Typical per-one-minute-bar return volatility, by asset class.
 *
 * THIS TABLE EXISTS TO PREVENT ONE SPECIFIC BUG, which has already shipped
 * twice in this project: a risk setting calibrated against a volatility the
 * market does not actually have, which then silently pins at a clamp and stops
 * doing anything. `volTargetPct` shipped at 0.4% against a 0.15% market and sat
 * on its 2.0x ceiling; `portfolioVolTargetPct` shipped at 0.8% against a 0.09%
 * reachable maximum. Neither was detectable by reading the code.
 *
 * FX makes that failure mode certain rather than likely. EUR/USD runs at
 * roughly an EIGHTH of crypto's per-bar volatility, so every crypto-calibrated
 * number in the config — the 2%/4% day-profile stop and target, the volatility
 * target, the portfolio budget — is off by an order of magnitude on it. A 4%
 * take-profit on EUR/USD is an eighteen-sigma move over a six-hour hold: not
 * conservative, simply unreachable, and a target that never triggers turns
 * every exit into a stop or a timeout.
 *
 * So the synthetic generator's volatility and the risk scaling both read from
 * HERE. Deriving them from one constant is what stops them drifting apart.
 *
 * Annualised, these are roughly: crypto ~110% (24/7 bars), equities ~19% (RTH
 * bars), FX ~7% — which is about where the majors actually sit.
 */
export const TYPICAL_BAR_VOL: Record<AssetClass, number> = {
  crypto: 0.0015,
  stock: 0.0006,
  forex: 0.00012,
};

/**
 * How far to scale a crypto-calibrated risk setting for this symbol.
 *
 * 1.0 for crypto (the baseline everything in this repo was tuned against),
 * 0.4 for equities, 0.08 for FX. Multiply any volatility-denominated setting
 * — stop, take-profit, volatility target — by this before applying it.
 *
 * This preserves the existing evidence rather than discarding it. The day
 * profile's 2%/4% stop and target came out of a measured sweep; scaling keeps
 * the RATIO that sweep established while moving it onto an instrument that
 * actually travels those distances.
 */
export function volScaleFor(symbol: string): number {
  return TYPICAL_BAR_VOL[assetClassOf(symbol)] / TYPICAL_BAR_VOL.crypto;
}

/**
 * Round a quantity to something the venue will accept.
 *
 * FX trades in whole units of the base currency and accepts a limit order at
 * any size. The crypto and equity branches below are retained for the
 * comparison tools, which backtest those classes to establish what FX costs
 * are being measured against; equities notably could only rest a limit order
 * at whole-share sizes, which is why that branch reports whether a limit was
 * possible at all.
 */
export function roundQtyFor(
  symbol: string,
  qty: number,
  wantLimit: boolean,
  /**
   * True when this order CLOSES a position.
   *
   * Exits must never be rounded down. Flooring 2.7 shares to a 2-share limit
   * order left 0.7 shares open while the engine recorded a full exit — and the
   * venue-side stop had already been cancelled in preparation for that exit,
   * so the remainder sat unprotected and unaccounted for. Giving up the maker
   * fee on the occasional fractional exit is the cheaper mistake by far.
   */
  isExit = false,
): { qty: number; canUseLimit: boolean } {
  const cls = assetClassOf(symbol);
  // FX trades in whole units of the base currency and accepts limit orders at
  // any size, so there is no fractional-limit problem to work around here. One
  // unit of EUR is about 90p, so flooring costs essentially nothing — and on an
  // exit it can only ever leave a sub-unit remainder the venue would refuse to
  // trade anyway.
  if (cls === "forex") {
    return { qty: roundUnits(qty), canUseLimit: wantLimit };
  }
  if (cls === "crypto") {
    return { qty: Math.floor(qty * 1e9) / 1e9, canUseLimit: wantLimit };
  }
  if (!wantLimit) {
    // Fractional market order, to 6dp.
    return { qty: Math.floor(qty * 1e6) / 1e6, canUseLimit: false };
  }
  const whole = Math.floor(qty);
  // An exit whose size is not a whole number of shares crosses as a market
  // order for the FULL quantity rather than resting a truncated limit.
  if (isExit && Math.abs(qty - whole) > 1e-9) {
    return { qty: Math.floor(qty * 1e6) / 1e6, canUseLimit: false };
  }
  if (whole >= 1) return { qty: whole, canUseLimit: true };
  // Less than a full share: fractional, which forces a market order.
  return { qty: Math.floor(qty * 1e6) / 1e6, canUseLimit: false };
}

// Fee rates used to live here, in a feeRatesFor() that NOTHING EVER CALLED —
// it looked like the cost model while the real one was a set of flat constants
// in execution.ts that charged crypto and equities the same. Moved to costs.ts
// as a single source of truth, applied per asset class and overridable from
// config. Left as a note because a plausible-looking dead cost model is a
// genuinely dangerous thing to leave lying around.
