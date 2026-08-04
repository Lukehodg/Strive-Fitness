// Asset-class rules. Crypto and US equities differ in ways that silently
// corrupt behaviour if you treat them the same: different market-data
// endpoints, different symbol spellings per API, different order types, and —
// unlike crypto — equities are closed most of the time.

export type AssetClass = "crypto" | "stock";

/**
 * Crypto pairs are quoted with a slash ("BTC/USD", "ETH/USD"); equities are
 * bare tickers ("AAPL", "SPY"). That is exactly how Alpaca distinguishes them
 * in its own APIs, so it needs no configuration from the user.
 */
export function assetClassOf(symbol: string): AssetClass {
  return symbol.includes("/") ? "crypto" : "stock";
}

/**
 * Alpaca spells the same instrument differently per endpoint. Crypto orders
 * and market data use "BTC/USD", but the positions endpoint wants "BTCUSD".
 * Equities use the bare ticker everywhere.
 */
export function positionSymbol(symbol: string): string {
  return assetClassOf(symbol) === "crypto" ? symbol.replace("/", "") : symbol;
}

/** Market-data host path for this asset class. */
export function barsUrl(symbol: string, params: URLSearchParams): string {
  return assetClassOf(symbol) === "crypto"
    ? `https://data.alpaca.markets/v1beta3/crypto/us/bars?${params}`
    : `https://data.alpaca.markets/v2/stocks/bars?${params}`;
}

/**
 * Time-in-force. Equity orders are scoped to the session ("day") so nothing
 * survives overnight into a gap; crypto trades continuously so "gtc" is right.
 */
export function timeInForce(symbol: string): "day" | "gtc" {
  return assetClassOf(symbol) === "crypto" ? "gtc" : "day";
}

/**
 * Round a quantity to something the venue will accept.
 *
 * Crypto takes fractional units freely. Equities accept fractional shares too,
 * but ONLY as market orders — Alpaca rejects a fractional limit order. So when
 * a limit (maker) order is wanted on a stock we round down to whole shares,
 * and report whether that was possible. Falling back to whole shares keeps the
 * cheaper maker fill; if the position is smaller than one share, the caller
 * must use a market order instead.
 */
export function roundQtyFor(
  symbol: string,
  qty: number,
  wantLimit: boolean,
): { qty: number; canUseLimit: boolean } {
  if (assetClassOf(symbol) === "crypto") {
    return { qty: Math.floor(qty * 1e9) / 1e9, canUseLimit: wantLimit };
  }
  if (!wantLimit) {
    // Fractional market order — Alpaca allows up to 9dp on notional-ish sizes.
    return { qty: Math.floor(qty * 1e6) / 1e6, canUseLimit: false };
  }
  const whole = Math.floor(qty);
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
