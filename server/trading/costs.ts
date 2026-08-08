// Execution cost model — ONE source of truth for what a trade costs.
//
// WHY THIS FILE EXISTS. There were two, and they disagreed. execution.ts held
// hardcoded TAKER_FEE_RATE/MAKER_FEE_RATE applied uniformly to everything,
// while assets.ts exported a per-asset-class feeRatesFor() that nothing ever
// called — dead code that looked like the cost model but wasn't. The result
// was wrong in both directions at once:
//
//   - CRYPTO was UNDERCHARGED. The model used 0.10% taker against a real entry
//     tier nearer 0.25%. Every backtest was optimistic, and the error scaled
//     with turnover — worst exactly where the day-trading profile lives.
//   - EQUITIES were OVERCHARGED on commission and undercharged on spread,
//     which is the cost that actually exists there.
//
// Pricing that correctly is what showed execution to be the binding constraint
// in this system, and that is what led to trading FX instead: the majors cost
// roughly a sixty-fifth of crypto. The crypto and equity rows survive below
// only as the comparison forexEval.ts measures against.
//
// CALIBRATE THIS AGAINST YOUR OWN FILLS. The defaults below are a documented
// starting point, not gospel — fee tiers change and depend on volume. Every
// rate is overridable from config precisely so you can set what you actually
// observe on your statements rather than trusting a number I wrote down. The
// dashboard shows what is in force.
//
// Being WRONG here is worse than being pessimistic, so the defaults lean
// conservative: overstating costs makes a real edge look smaller, while
// understating them manufactures an edge that does not exist. Only one of
// those mistakes loses money.

import type { AssetClass } from "./assets";
import { assetClassOf } from "./assets";
import { halfSpreadFraction, pairSpec } from "./forex";

export interface CostRates {
  /** Fee paid when crossing the spread (market/immediate order). */
  takerFee: number;
  /** Fee paid when a resting limit order is filled. */
  makerFee: number;
  /**
   * Adverse price movement assumed on a taker fill — half the spread, plus
   * impact. Makers do not pay this: they fill at their own posted price.
   */
  takerSlippage: number;
}

/**
 * Defaults per asset class.
 *
 * Crypto: Alpaca's lowest volume tier, which is where a personal account sits.
 * Equities: commission-free at Alpaca, so the entire cost is the spread. One
 * cent on a $200 mega-cap is 0.005%; 0.02% is a deliberately conservative
 * allowance covering less liquid names and moments of wider quotes.
 */
export const DEFAULT_RATES: Record<AssetClass, CostRates> = {
  crypto: { takerFee: 0.0025, makerFee: 0.0015, takerSlippage: 0.0005 },
  stock: { takerFee: 0, makerFee: 0, takerSlippage: 0.0002 },
  // FX slippage is NOT a constant — it is half the quoted spread in pips,
  // divided by the price, so it differs per pair and moves with the rate.
  // These entries are the fallback for a pair with no spec; the real numbers
  // come from forex.ts via halfSpreadFraction(). Retail FX charges no
  // commission on a spread account, hence zero fees on both sides.
  forex: { takerFee: 0, makerFee: 0, takerSlippage: 0.0001 },
};

/** Overrides, as configured by the user. Null means "use the default". */
export interface CostOverrides {
  /**
   * FX commission per side, for ECN-style accounts that quote a raw spread
   * plus a fee rather than marking the spread up. Zero on a standard retail
   * spread account, which is the default.
   */
  forexCommission?: number | null;
}

let overrides: CostOverrides = {};

/** Apply user-configured rates. Called whenever config changes. */
export function setCostOverrides(next: CostOverrides): void {
  overrides = next ?? {};
}

const num = (v: number | null | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;

/**
 * The rates in force for a symbol, after overrides.
 *
 * `price` matters only for FX, where cost is a spread in pips rather than a
 * percentage. Omitting it falls back to the pair's reference price, which is
 * accurate to within the rate's drift — fine for reporting, but pass the real
 * price anywhere the number reaches a fill.
 */
export function ratesFor(symbol: string, price?: number): CostRates {
  const cls = assetClassOf(symbol);
  const base = DEFAULT_RATES[cls];
  if (cls === "forex") {
    // Half the quoted spread per side, so a round trip pays exactly one full
    // spread — the number the broker's spread table quotes.
    const commission = num(overrides.forexCommission, base.takerFee);
    // "No spec" and "spread of zero" are DIFFERENT and must not share a
    // branch. This used to read `half > 0 ? half : base.takerSlippage`, so
    // configuring a pair's spread to 0 — which is what you would do to measure
    // what costs are actually costing you — silently substituted the 0.01%
    // fallback instead: more than double a real 1-pip spread. Removing the
    // cost made trading look MORE expensive, which is exactly the kind of
    // inverted result that sends you hunting for a bug in the wrong file.
    const spec = pairSpec(symbol);
    return {
      takerFee: commission,
      // A resting limit order is filled AT ITS OWN PRICE, so it does not pay
      // the spread. It still pays commission on an ECN account, which is why
      // the maker fee tracks the commission rather than being hardcoded to 0.
      makerFee: commission,
      takerSlippage: spec ? halfSpreadFraction(symbol, price) : base.takerSlippage,
    };
  }
  // Crypto and equities are NOT TRADEABLE here — OANDA lists neither — but
  // their rates stay in the table on purpose. forexEval.ts is the recorded
  // evidence for choosing FX at all, and that argument ("an edge of this size
  // survives FX costs and does not survive crypto costs") is only checkable
  // while the thing it was measured against is still in the model. Deleting
  // these would leave the conclusion with nothing to compare against.
  return base;
}

/**
 * Total round-trip cost as a fraction, for reporting.
 *
 * This is the number that decides whether a strategy can work at all: a target
 * smaller than a few multiples of this is arithmetic, not trading.
 */
export function roundTripCost(symbol: string, maker: boolean, price?: number): number {
  const r = ratesFor(symbol, price);
  return maker ? r.makerFee * 2 : (r.takerFee + r.takerSlippage) * 2;
}

/** Everything in force right now, for the API and the dashboard. */
export function currentRates(): Array<{ assetClass: AssetClass; rates: CostRates; overridden: boolean }> {
  return (Object.keys(DEFAULT_RATES) as AssetClass[]).map((cls) => {
    const sample = cls === "crypto" ? "BTC/USD" : cls === "forex" ? "EUR/USD" : "AAPL";
    const rates = ratesFor(sample);
    const base = DEFAULT_RATES[cls];
    return {
      assetClass: cls,
      rates,
      overridden: rates.takerFee !== base.takerFee || rates.makerFee !== base.makerFee,
    };
  });
}
