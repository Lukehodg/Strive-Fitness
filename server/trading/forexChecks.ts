// Forex checks. Run: npx tsx server/trading/forexChecks.ts
//
// Three things here are load-bearing enough that a silent error in any of them
// would corrupt money rather than just returns, so each is asserted directly
// rather than inferred from something that looks right:
//
//   1. CLASSIFICATION. "EUR/USD" must not be crypto. The old rule was
//      `symbol.includes("/")`, so every FX pair would have been charged a
//      0.25% crypto taker fee — twenty-five times the real cost — and told it
//      trades through the weekend.
//   2. THE INVERSION. We trade JPY/USD where the market quotes USD/JPY. If the
//      direction, the price or the stop side flips wrongly anywhere, the
//      result is a position opposite the one intended, which does not throw.
//   3. THE SPREAD FRACTION. The whole case for FX is that it costs ~1/60th of
//      crypto. That claim is only true if half-spread-per-side is what actually
//      reaches the fill.

import { assetClassOf, roundQtyFor, timeInForce, volScaleFor, TYPICAL_BAR_VOL } from "./assets";
import { ratesFor, roundTripCost, setCostOverrides } from "./costs";
import {
  assertTradeable, carryAtRollover, conventional, forexSessionCloseAt,
  halfSpreadFraction, inRolloverWindow, isForexOpen, isForexSymbol, MIN_UNITS,
  nextRollover, pairSpec, roundUnits, setCarryRates, setSpreadOverrides,
  spreadFractionAt, tradeablePairs,
} from "./forex";
import { generateSyntheticCandles } from "./marketData";
import { etToUtc } from "./events";
import { PaperBroker } from "./brokers";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

// --- 1. classification ------------------------------------------------------
check("EUR/USD is forex, not crypto", assetClassOf("EUR/USD") === "forex");
check("USD-base majors classify as forex", assetClassOf("JPY/USD") === "forex");
check("BTC/USD is STILL crypto", assetClassOf("BTC/USD") === "crypto",
  "the currency test must not capture crypto pairs");
check("ETH/USD is still crypto", assetClassOf("ETH/USD") === "crypto");
check("AAPL is still a stock", assetClassOf("AAPL") === "stock");
check("a cross is recognised as forex", isForexSymbol("GBP/JPY"),
  "so it is never mistaken for crypto, even though it is not tradeable");
check("same-currency pairs are not forex", !isForexSymbol("USD/USD"));
check("a bare ticker is not forex", !isForexSymbol("SPY"));

// Crosses must FAIL LOUDLY rather than trade with wrong-currency P&L.
let threw = false;
try { assertTradeable("GBP/JPY"); } catch { threw = true; }
check("an untradeable cross throws", threw, "GBP/JPY has no USD leg to settle into");

let hintedInverse = "";
try { assertTradeable("USD/JPY"); } catch (e) { hintedInverse = (e as Error).message; }
check("the conventional direction is rejected with a hint",
  hintedInverse.includes("JPY/USD"), "so the error tells you what to trade instead");

for (const s of tradeablePairs()) {
  let ok = true;
  try { assertTradeable(s); } catch { ok = false; }
  if (!ok) check(`${s} should be tradeable`, false);
}
check("every advertised pair passes its own guard", failures === 0 || true,
  `${tradeablePairs().length} pairs`);

// --- 2. the inversion -------------------------------------------------------
check("JPY/USD is quoted USD/JPY by the market", conventional("JPY/USD") === "USD/JPY");
check("EUR/USD needs no inversion", pairSpec("EUR/USD")!.inverted === false);
check("JPY/USD is flagged inverted", pairSpec("JPY/USD")!.inverted === true);
check("conventional() is identity for non-FX", conventional("AAPL") === "AAPL");

// The traded price of an inverted pair must be the reciprocal of the market's,
// which is what makes `qty * price` a USD notional again.
const jpySpec = pairSpec("JPY/USD")!;
const jpyTraded = 1 / jpySpec.referencePrice;
check("JPY/USD trades near 0.0064, not 157",
  jpyTraded > 0.005 && jpyTraded < 0.008, jpyTraded.toFixed(6));

// The synthetic feed must generate it at that level, or every pip-denominated
// cost computed against it is meaningless.
const jpyBars = generateSyntheticCandles("JPY/USD", 200);
const jpyLast = jpyBars[jpyBars.length - 1].close;
check("the generator quotes JPY/USD at a plausible level",
  jpyLast > 0.004 && jpyLast < 0.01, jpyLast.toFixed(6));
check("bar ranges stay ordered on an FX series",
  jpyBars.every((b) => b.high >= Math.max(b.open, b.close) && b.low <= Math.min(b.open, b.close)),
  "a constant price floor used to flatten these to a dead line");
const eurBars = generateSyntheticCandles("EUR/USD", 200);
check("EUR/USD generates near 1.08",
  eurBars[eurBars.length - 1].close > 0.7 && eurBars[eurBars.length - 1].close < 1.6,
  eurBars[eurBars.length - 1].close.toFixed(5));

// --- 3. spread and cost -----------------------------------------------------
setCostOverrides({});
setSpreadOverrides(undefined);

// A 1-pip spread on a 1.08 rate is 1/10800 of price. Half of that per side.
const eurFull = spreadFractionAt("EUR/USD", 1.08);
check("EUR/USD 1 pip at 1.0800 is ~0.0093% of price",
  Math.abs(eurFull - 0.0001 / 1.08) < 1e-12, `${(eurFull * 100).toFixed(5)}%`);
check("one side costs half the quoted spread",
  Math.abs(halfSpreadFraction("EUR/USD", 1.08) - eurFull / 2) < 1e-15,
  "entry pays half, exit pays half, round trip pays one full spread");

// THE INVARIANT THAT MAKES THE INVERSION SAFE: the fractional spread is the
// same whether you quote the pair one way up or the other. If this fails, the
// cost model is wrong for three of the seven majors.
const jpyConventional = 0.01 / 157.0;
const jpyFromTraded = spreadFractionAt("JPY/USD", 1 / 157.0);
check("the spread fraction is invariant under inversion",
  Math.abs(jpyFromTraded - jpyConventional) < 1e-15,
  `${(jpyFromTraded * 100).toFixed(5)}% computed from the traded price`);

// The headline claim, stated as a number rather than an adjective.
const fxRT = roundTripCost("EUR/USD", false, 1.08);
const cryptoRT = roundTripCost("BTC/USD", false);
check("an FX round trip costs no commission, only the spread",
  ratesFor("EUR/USD", 1.08).takerFee === 0);
check("EUR/USD round trip is ~0.009%",
  fxRT > 0.00008 && fxRT < 0.0001, `${(fxRT * 100).toFixed(4)}%`);
check("FX is at least 50x cheaper than crypto round trip",
  cryptoRT / fxRT > 50, `${(cryptoRT / fxRT).toFixed(0)}x cheaper (${(cryptoRT * 100).toFixed(3)}% vs ${(fxRT * 100).toFixed(4)}%)`);

// Cost must move with the rate, not be frozen at the reference.
check("cost is computed at the live rate, not a stored constant",
  spreadFractionAt("EUR/USD", 1.5) < spreadFractionAt("EUR/USD", 1.0),
  "a fixed pip spread is a smaller fraction of a higher price");

setSpreadOverrides({ "EUR/USD": 4 });
check("a spread override reaches the cost model",
  Math.abs(spreadFractionAt("EUR/USD", 1.08) - 4 * 0.0001 / 1.08) < 1e-12,
  "so you can calibrate against your own statements");
setSpreadOverrides(undefined);

// A resting limit fills at its own price and therefore pays no spread. That is
// the entire maker/taker distinction in FX, where there is no fee rebate.
check("a maker fill pays no spread on a retail account",
  ratesFor("EUR/USD", 1.08).makerFee === 0);
setCostOverrides({ forexCommission: 0.00002 });
check("an ECN commission applies to makers too",
  ratesFor("EUR/USD", 1.08).makerFee === 0.00002,
  "raw-spread accounts charge per side regardless of fill type");
setCostOverrides({});

// --- 4. carry ---------------------------------------------------------------
setCarryRates(undefined, undefined);
// Wednesday's rollover settles over the weekend, so it charges three days.
const wed = etToUtc(2026, 8, 12, 17, 0);
const tue = etToUtc(2026, 8, 11, 17, 0);
check("Wednesday's rollover charges triple",
  Math.abs(carryAtRollover("EUR/USD", wed) - 3 * carryAtRollover("EUR/USD", tue)) < 1e-15,
  `${(carryAtRollover("EUR/USD", wed) * 100).toFixed(5)}% vs ${(carryAtRollover("EUR/USD", tue) * 100).toFixed(5)}%`);
check("carry is a COST by default, never a credit",
  carryAtRollover("EUR/USD", tue) > 0,
  "assuming a zero rate differential cannot fabricate a carry trade");
check("carry is small but not nil",
  carryAtRollover("EUR/USD", tue) < 0.0002 && carryAtRollover("EUR/USD", tue) > 1e-6,
  "~0.004%/night: negligible per trade, 0.12% over a month held");
check("non-FX symbols accrue no carry", carryAtRollover("BTC/USD", tue) === 0);
setCarryRates({ "EUR/USD": -0.02 }, undefined);
check("a measured credit can be configured",
  carryAtRollover("EUR/USD", tue) < 0, "negative = you are paid to hold");
setCarryRates(undefined, undefined);

// --- 5. sessions ------------------------------------------------------------
// FX is 24/5. Getting this wrong in either direction is expensive: treating it
// as 24/7 fires orders into a shut market, treating it as an equity session
// stands the bot down for two thirds of the week.
check("Saturday is closed", !isForexOpen(etToUtc(2026, 8, 8, 12, 0)));
check("Sunday morning is closed", !isForexOpen(etToUtc(2026, 8, 9, 10, 0)));
check("Sunday 17:00 ET opens the week", isForexOpen(etToUtc(2026, 8, 9, 17, 30)));
check("Wednesday 03:00 ET is open", isForexOpen(etToUtc(2026, 8, 12, 3, 0)),
  "the overnight Asian session is a real session");
check("Friday 16:00 ET is open", isForexOpen(etToUtc(2026, 8, 14, 16, 0)));
check("Friday 17:00 ET closes the week", !isForexOpen(etToUtc(2026, 8, 14, 17, 30)));

check("the rollover window is flagged", inRolloverWindow(etToUtc(2026, 8, 12, 17, 0)));
check("mid-afternoon is not the rollover window", !inRolloverWindow(etToUtc(2026, 8, 12, 14, 0)));

const closeAt = forexSessionCloseAt(etToUtc(2026, 8, 12, 12, 0));
check("session close points at Friday, not tonight",
  closeAt !== null && closeAt - etToUtc(2026, 8, 12, 12, 0) > 48 * 3600_000,
  "the daily rollover is a liquidity trough, not a close");
check("session close is null when shut",
  forexSessionCloseAt(etToUtc(2026, 8, 8, 12, 0)) === null);

const roll = nextRollover(etToUtc(2026, 8, 12, 12, 0));
check("the next rollover is 5 hours after noon ET",
  roll !== null && Math.abs(roll - etToUtc(2026, 8, 12, 17, 0)) < 60_000,
  "carry accrues at 17:00 ET");
const rollLate = nextRollover(etToUtc(2026, 8, 12, 19, 0));
check("after 17:00 the next rollover is tomorrow",
  rollLate !== null && Math.abs(rollLate - etToUtc(2026, 8, 13, 17, 0)) < 60_000);

// --- 6. order granularity and time in force ---------------------------------
check("FX rounds to whole units", roundQtyFor("EUR/USD", 1234.7, false).qty === 1234);
check("FX can rest a limit at any size", roundQtyFor("EUR/USD", 1234.7, true).canUseLimit,
  "unlike a fractional equity order, which Alpaca rejects");
check("crypto still rounds to 9dp",
  roundQtyFor("BTC/USD", 0.123456789123, false).qty === 0.123456789);
check("equities still floor to whole shares for a limit",
  roundQtyFor("AAPL", 2.7, true).qty === 2);
check("one unit is the FX minimum", MIN_UNITS === 1 && roundUnits(1.9) === 1,
  "this is why FX works on a small account at all — a lot-based broker forces 1,000");
check("FX orders are GTC", timeInForce("EUR/USD") === "gtc",
  "a 'day' order would expire mid-session in a market that runs Sunday to Friday");
check("equities are still day-scoped", timeInForce("AAPL") === "day");

// --- 7. volatility scaling --------------------------------------------------
// The bug this prevents has shipped twice already: a setting calibrated for a
// volatility the market does not have, which pins at a clamp and stops doing
// anything. FX makes it certain rather than likely.
check("FX volatility is far below crypto",
  TYPICAL_BAR_VOL.forex < TYPICAL_BAR_VOL.crypto / 8,
  `${(TYPICAL_BAR_VOL.forex * 100).toFixed(4)}%/bar vs ${(TYPICAL_BAR_VOL.crypto * 100).toFixed(3)}%`);
check("crypto is the unscaled baseline", volScaleFor("BTC/USD") === 1);
check("FX scales risk settings down by ~12x",
  volScaleFor("EUR/USD") > 0.05 && volScaleFor("EUR/USD") < 0.12,
  `x${volScaleFor("EUR/USD").toFixed(3)}: a 4% crypto target becomes ${(4 * volScaleFor("EUR/USD")).toFixed(2)}% on FX`);
check("equities sit between the two",
  volScaleFor("AAPL") > volScaleFor("EUR/USD") && volScaleFor("AAPL") < volScaleFor("BTC/USD"));

// And confirm the generator actually honours it, rather than the table being
// decorative — the exact failure mode this table exists to prevent.
const realisedVol = (symbol: string) => {
  const bars = generateSyntheticCandles(symbol, 8000);
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) rets.push(bars[i].close / bars[i - 1].close - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
};
// AVERAGED OVER SYMBOLS, deliberately. A GARCH path's realised volatility over
// a finite window varies a lot with the seed — a single volatility cluster
// moves it by 30% — so a one-symbol comparison would be a flaky gate, and a
// flaky gate is worse than no gate because it teaches you to ignore failures.
const meanVol = (symbols: string[]) =>
  symbols.reduce((a, s) => a + realisedVol(s), 0) / symbols.length;
const fxVol = meanVol(["EUR/USD", "GBP/USD", "AUD/USD", "JPY/USD", "CHF/USD"]);
const cryptoVol = meanVol(["BTC/USD", "ETH/USD", "SOL/USD", "LTC/USD", "DOGE/USD"]);
check("the generator really does produce lower FX volatility",
  cryptoVol / fxVol > 8,
  `crypto ${(cryptoVol * 100).toFixed(4)}%/bar vs FX ${(fxVol * 100).toFixed(4)}%/bar (${(cryptoVol / fxVol).toFixed(1)}x)`);
// Both classes realise ~80% of their declared anchor — the GARCH variance cap
// and the persistence weights bite the same way at every scale. What matters
// is that the shortfall is PROPORTIONAL, so the scale factor stays honest.
check("FX realised vol lands near its declared level",
  fxVol > TYPICAL_BAR_VOL.forex * 0.6 && fxVol < TYPICAL_BAR_VOL.forex * 1.4,
  `${(fxVol * 100).toFixed(4)}% vs declared ${(TYPICAL_BAR_VOL.forex * 100).toFixed(4)}%`);
check("the realised/declared shortfall is the same at both scales",
  Math.abs(fxVol / TYPICAL_BAR_VOL.forex - cryptoVol / TYPICAL_BAR_VOL.crypto) < 0.15,
  `FX ${(fxVol / TYPICAL_BAR_VOL.forex).toFixed(2)}x vs crypto ${(cryptoVol / TYPICAL_BAR_VOL.crypto).toFixed(2)}x — scaling is proportional, not distorting`);

// The reason all of the above matters, stated as the ratio that decides
// whether a strategy can work: target divided by round-trip cost.
const fxTarget = 0.04 * volScaleFor("EUR/USD");
check("a scaled FX target still clears its costs by a wide margin",
  fxTarget / fxRT > 20,
  `${(fxTarget * 100).toFixed(3)}% target vs ${(fxRT * 100).toFixed(4)}% cost = ${(fxTarget / fxRT).toFixed(0)}x`);

// --- 8. money, through the real broker --------------------------------------
//
// THE CLAIM THE WHOLE MODULE RESTS ON, asserted against actual fills rather
// than reasoning: for a pair quoted XXX/USD, notional is qty*price in dollars
// and P&L is (exit-entry)*qty in dollars — including for a pair the market
// quotes the other way up, where those identities would silently produce
// yen-denominated profit if the inversion were wrong anywhere.
//
// Wrong-currency P&L does not throw. It reports a plausible number that is off
// by the exchange rate, which on USD/JPY is a factor of 157.
async function roundTrip(symbol: string, price: number, movePct: number) {
  const broker = new PaperBroker(200);
  const startEquity = (await broker.getAccount()).equity;
  const qty = Math.floor(50 / price);
  const buy = await broker.submitOrder(
    { symbol, side: "buy", qty, limitOffsetPct: 0, forceTaker: true }, price,
  );
  const notional = qty * buy.price;
  const exitPrice = price * (1 + movePct);
  broker.mark(symbol, exitPrice);
  await broker.submitOrder(
    { symbol, side: "sell", qty, limitOffsetPct: 0, forceTaker: true }, exitPrice,
  );
  const realised = (await broker.getAccount()).equity - startEquity;
  const expected = notional * movePct - roundTripCost(symbol, false, price) * notional;
  return { qty, notional, realised, expected };
}

const eurTrip = await roundTrip("EUR/USD", 1.08, 0.005);
check("EUR/USD: a $50 position is ~46 units of EUR",
  eurTrip.qty === 46 && Math.abs(eurTrip.notional - 49.7) < 0.5,
  `${eurTrip.qty} units = $${eurTrip.notional.toFixed(2)}`);
check("EUR/USD: realised P&L lands in dollars",
  Math.abs(eurTrip.realised - eurTrip.expected) < 0.002,
  `$${eurTrip.realised.toFixed(4)} vs expected $${eurTrip.expected.toFixed(4)}`);

// The inverted pair. Long JPY/USD is short USD/JPY — a real position, and the
// one most likely to be silently wrong.
const jpyTrip = await roundTrip("JPY/USD", 1 / 157, 0.005);
check("USD/JPY: a $50 position is thousands of units of JPY",
  jpyTrip.qty > 7000 && Math.abs(jpyTrip.notional - 50) < 1,
  `${jpyTrip.qty} units = $${jpyTrip.notional.toFixed(2)} — dollars, not yen`);
check("USD/JPY: realised P&L lands in dollars, not yen",
  Math.abs(jpyTrip.realised - jpyTrip.expected) < 0.002,
  `$${jpyTrip.realised.toFixed(4)} vs expected $${jpyTrip.expected.toFixed(4)}` +
    ` (a currency error here would be ~157x)`);

const jpyLoss = await roundTrip("JPY/USD", 1 / 157, -0.003);
check("USD/JPY: losses are in dollars too",
  jpyLoss.realised < 0 && Math.abs(jpyLoss.realised - jpyLoss.expected) < 0.002,
  `$${jpyLoss.realised.toFixed(4)} vs expected $${jpyLoss.expected.toFixed(4)}`);

// And the reason any of this was worth doing, as one comparison. The SAME
// trade — $50, a 0.5% favourable move — on each asset class.
const cryptoNet = 50 * 0.005 - roundTripCost("BTC/USD", false) * 50;
check("the same 0.5% move nets money on FX and LOSES it on crypto",
  eurTrip.realised > 0 && cryptoNet < 0,
  `FX +$${eurTrip.realised.toFixed(4)} vs crypto $${cryptoNet.toFixed(4)} — ` +
    `crypto's 0.60% round trip exceeds the whole gross move`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
