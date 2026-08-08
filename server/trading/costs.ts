// Execution cost model — ONE source of truth for what a trade costs.
//
// WHY THIS FILE EXISTS. There were two, and they disagreed. execution.ts held
// hardcoded TAKER_FEE_RATE/MAKER_FEE_RATE applied uniformly to everything,
// while assets.ts exported a per-asset-class feeRatesFor() that nothing ever
// called — dead code that looked like the cost model but wasn't. The result
// was wrong in both directions at once:
//
//   - CRYPTO was UNDERCHARGED. The model used 0.10% taker, while Alpaca's
//     entry crypto tier is nearer 0.25%. Every backtest was therefore
//     optimistic, and the error scaled with turnover — worst exactly where the
//     day-trading profile lives.
//   - EQUITIES were OVERCHARGED on commission (0.10% when Alpaca charges none)
//     and undercharged on spread, which is the cost that actually exists there.
//
// At a 1.5% take-profit target those are not rounding errors. A 0.25%/side
// taker cost is a third of the gross target consumed before the trade is even
// right.
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
import { halfSpreadFraction } from "./forex";

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
  cryptoTakerFee?: number | null;
  cryptoMakerFee?: number | null;
  equityTakerFee?: number | null;
  equityMakerFee?: number | null;
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
  if (cls === "crypto") {
    return {
      takerFee: num(overrides.cryptoTakerFee, base.takerFee),
      makerFee: num(overrides.cryptoMakerFee, base.makerFee),
      takerSlippage: base.takerSlippage,
    };
  }
  if (cls === "forex") {
    // Half the quoted spread per side, so a round trip pays exactly one full
    // spread — the number the broker's spread table quotes.
    const half = halfSpreadFraction(symbol, price);
    const commission = num(overrides.forexCommission, base.takerFee);
    return {
      takerFee: commission,
      // A resting limit order is filled AT ITS OWN PRICE, so it does not pay
      // the spread. It still pays commission on an ECN account, which is why
      // the maker fee tracks the commission rather than being hardcoded to 0.
      makerFee: commission,
      takerSlippage: half > 0 ? half : base.takerSlippage,
    };
  }
  return {
    takerFee: num(overrides.equityTakerFee, base.takerFee),
    makerFee: num(overrides.equityMakerFee, base.makerFee),
    takerSlippage: base.takerSlippage,
  };
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
