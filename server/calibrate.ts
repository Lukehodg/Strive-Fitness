// Calibration probe — is every configured magnitude in a range where it can
// actually DO anything?
//
//   npm run calibrate
//
// WHY THIS EXISTS. Two risk controls shipped switched-on, visible in the UI,
// and structurally incapable of ever acting:
//
//   - portfolioVolTargetPct defaulted to 0.8%/bar when a fully-invested,
//     perfectly-correlated book reaches only ~0.09% on 1-minute bars. Nine
//     times above anything achievable. Its schema FLOOR was also above that
//     ceiling, so no legal value would have worked either.
//   - volTargetPct defaulted to 0.4%/bar against a realised ~0.15%, pinning
//     computeVolatilityMultiplier at its 2.0 clamp for every symbol. It could
//     only ever size UP — the opposite of its purpose.
//
// Both numbers were DERIVED from other numbers ("0.4% per position, so a bit
// more for a book") instead of measured. Both looked entirely reasonable. Both
// were wrong by an order of magnitude, and neither was caught by typechecking,
// by unit tests, or by watching the app run — because a control that never
// fires looks exactly like a calm market.
//
// So this prints every such magnitude beside the value actually observed in
// the data, and flags the ones that cannot bind. A control that is never
// reached is worse than an absent one: it invites a trust it cannot repay.

// Load .env before anything reads process.env. Run directly via `tsx`, not
// through index.ts (which loads this itself), a real .env sitting right next
// to package.json was silently ignored: createMarketFeed() below always saw
// "no OANDA credentials" and probed the synthetic generator instead of real
// market data, with the header printing `feed: synthetic` and no indication
// anything was missing. Exactly the kind of failure this file exists to catch
// in the app's OWN settings — shipped in its own credential loading instead.
import "dotenv/config";

import { storage } from "./storage";
import { createMarketFeed } from "./trading/marketData";
import { computeVolatilityMultiplier } from "./trading/sizing";
import { returnsOf, correlation } from "./trading/portfolio";
import { volatilityOf, portfolioVolatility, type RiskLeg } from "./trading/portfolioVol";
import { setCostOverrides, roundTripCost } from "./trading/costs";
import { SWITCH_MARGIN, REGIME_FIT_BONUS } from "./trading/aiSelector";
import { assetClassOf, volScaleFor } from "./trading/assets";
import { carryAtRollover, setCarryRates, setSpreadOverrides } from "./trading/forex";
import { getPreset, UNIVERSE_PRESETS } from "./trading/universes";
import type { Candle } from "@shared/schema";

const feed = createMarketFeed();

/**
 * Optional overrides, so a value can be tested BEFORE it is committed to:
 *
 *   npm run calibrate -- volTargetPct=0.004 portfolioVolTargetPct=0.008
 *
 * That is the whole workflow this tool is for. Both of the inert-control bugs
 * would have taken one run of exactly that command to catch.
 */
const overrides: Record<string, number | string | boolean | string[]> = {};
for (const arg of process.argv.slice(2)) {
  const [k, v] = arg.split("=");
  if (!k || v === undefined) continue;
  if (Number.isFinite(Number(v))) {
    overrides[k] = Number(v);
  } else if (v === "true" || v === "false") {
    overrides[k] = v === "true";
  } else if (k === "preset") {
    // A whole universe, so you can ask "would my settings work on FX?"
    // without editing anything:  npm run calibrate -- preset=forex
    const p = getPreset(v);
    if (!p) {
      console.error(`Unknown preset "${v}". Try: ${UNIVERSE_PRESETS.map((u) => u.id).join(", ")}`);
      process.exit(1);
    }
    overrides.symbol = p.symbols[0];
    overrides.extraSymbols = p.symbols.slice(1);
  } else {
    overrides[k] = v;
  }
}
const config = { ...storage.getConfig(), ...overrides } as ReturnType<typeof storage.getConfig>;
setCostOverrides(config);
setSpreadOverrides(config.forexSpreadPips);
setCarryRates(config.forexCarryByPair, config.forexCarryAnnual);
if (Object.keys(overrides).length) {
  console.log(`Overrides applied: ${Object.entries(overrides).map(([k, v]) => `${k}=${v}`).join(" ")}\n`);
}

type Verdict = "OK" | "INERT" | "WARN";
const rows: Array<{ name: string; configured: string; measured: string; verdict: Verdict; note: string }> = [];

const add = (name: string, configured: string, measured: string, verdict: Verdict, note = "") =>
  rows.push({ name, configured, measured, verdict, note });

const universe = [config.symbol, ...(config.extraSymbols ?? [])].slice(0, 8);
const bars: Record<string, Candle[]> = {};
for (const s of universe) {
  try {
    // 500 bars, not 200. Volatility is the denominator of nearly every
    // verdict here, and at 200 bars its standard error is ~5%, which was
    // enough to move a marginal setting across the INERT boundary between
    // runs. A probe whose answer depends on the sample is not a probe.
    bars[s] = await feed.getCandles(s, 500);
  } catch {
    /* skip unreachable symbols */
  }
}
const available = Object.keys(bars);
if (!available.length) {
  console.error("No market data available — cannot calibrate.");
  process.exit(1);
}

const vols = available.map((s) => volatilityOf(returnsOf(bars[s])));
const medianVol = [...vols].sort((a, b) => a - b)[Math.floor(vols.length / 2)];
const pct = (x: number, dp = 3) => `${(x * 100).toFixed(dp)}%`;

console.log(`Calibration probe — feed: ${feed.source}, ${available.length} symbol(s), 500 bars each\n`);
if (feed.source === "synthetic") {
  console.log("  NOTE: synthetic feed. These readings describe the generator, not a market.\n");
}

/**
 * The risk scale the ENGINE would apply to this symbol.
 *
 * Calibrate has to model what the engine actually does or it is probing a
 * different system. Once the engine started scaling volatility-denominated
 * settings per asset class, a probe that ignored the scaling would report
 * every FX symbol as INERT — a false alarm on a correctly configured book —
 * while telling you nothing about whether the SCALED value binds, which is the
 * only question that matters.
 */
const scaleOf = (s: string) => (config.scaleRiskByAssetClass ? volScaleFor(s) : 1);

// --- 1. Per-symbol volatility target ----------------------------------------
{
  const mults = available.map((s) => computeVolatilityMultiplier(bars[s], config.volTargetPct * scaleOf(s)));
  const allPinnedHigh = mults.every((m) => m >= 1.999);
  const allPinnedLow = mults.every((m) => m <= 0.251);
  add(
    "volTargetPct",
    pct(config.volTargetPct),
    `realised ${pct(medianVol)} · multipliers ${mults.map((m) => m.toFixed(2)).join(", ")}`,
    allPinnedHigh || allPinnedLow ? "INERT" : "OK",
    allPinnedHigh
      ? "pinned at the 2.0 clamp — can only size UP, never down"
      : allPinnedLow
        ? "pinned at the 0.25 clamp — always sizing minimum"
        : "moves in both directions",
  );
}

// --- 2. Portfolio volatility budget ------------------------------------------
{
  // The most volatile book the limits permit: total exposure at full
  // correlation, which is the worst case the budget is meant to catch.
  const worstLegs: RiskLeg[] = [{ symbol: "X", weight: config.maxTotalExposurePct, vol: medianVol }];
  const ceiling = portfolioVolatility(worstLegs, () => 1);
  // Scaled by the book's mean asset-class scale, exactly as the engine does.
  const meanScale = available.reduce((a, s) => a + scaleOf(s), 0) / available.length;
  const budget = config.portfolioVolTargetPct * meanScale;
  add(
    "portfolioVolTargetPct",
    pct(budget),
    `max reachable book vol ${pct(ceiling)} (at ${pct(config.maxTotalExposurePct, 0)} exposure, corr 1)`,
    !config.portfolioVolTarget ? "OK" : budget >= ceiling ? "INERT" : budget < ceiling * 0.2 ? "WARN" : "OK",
    !config.portfolioVolTarget
      ? "disabled"
      : budget >= ceiling
        ? "above anything the book can reach — will never bind"
        : budget < ceiling * 0.2
          ? "very tight; will block most second positions"
          : `binds at ~${pct((budget / medianVol) , 0)} total exposure`,
  );
}

// --- 3. Costs against the profit target --------------------------------------
//
// ONE ROW PER ASSET CLASS IN THE UNIVERSE, not one row for the primary symbol.
// Cost and volatility both differ by more than an order of magnitude across
// classes, so a single verdict computed from config.symbol says nothing about
// the rest of the book. A mixed universe reporting "OK" off its one crypto
// symbol would hide an FX target that cannot pay for itself, and vice versa.
const classesPresent = Array.from(new Set(available.map(assetClassOf)));
for (const cls of classesPresent) {
  const sample = available.find((s) => assetClassOf(s) === cls)!;
  const price = bars[sample][bars[sample].length - 1].close;
  const taker = roundTripCost(sample, false, price);
  const target = config.takeProfitPct * scaleOf(sample);
  const share = target > 0 ? taker / target : 1;
  add(
    `takeProfitPct vs cost · ${cls}`,
    pct(target, 3),
    `round trip ${pct(taker, 4)} = ${(share * 100).toFixed(1)}% of target`,
    share > 0.33 ? "WARN" : "OK",
    share > 0.33
      ? "costs eat a third or more of the gross target — widen it or trade less"
      : "target is a healthy multiple of costs",
  );
}

// --- 4. Stop-loss against the noise ------------------------------------------
//
// Also per class, and for the same reason: "3 bars of typical movement" is a
// property of the instrument's volatility, and the whole point of the risk
// scaling is that the same configured percentage means a different number of
// bars on FX than on crypto. This row is what proves the scaling landed.
for (const cls of classesPresent) {
  const members = available.filter((s) => assetClassOf(s) === cls);
  const clsVols = members.map((s) => volatilityOf(returnsOf(bars[s])));
  const clsVol = [...clsVols].sort((a, b) => a - b)[Math.floor(clsVols.length / 2)];
  const stop = config.stopLossPct * scaleOf(members[0]);
  const barsToStop = clsVol > 0 ? stop / clsVol : Infinity;
  add(
    `stopLossPct · ${cls}`,
    pct(stop, 3),
    `realised ${pct(clsVol, 4)}/bar — ${barsToStop.toFixed(1)} bars of typical movement`,
    barsToStop < 3 ? "WARN" : "OK",
    barsToStop < 3
      ? "inside the noise — random movement will trigger it"
      : "outside normal bar-to-bar noise",
  );
}

// --- 4b. FX overnight carry against the target -------------------------------
//
// The cost that does not show up in a round trip. It accrues per night held,
// so a swing profile pays it repeatedly on a position a day profile never
// pays at all — and at ~0.004%/night against a 0.32% target it is small per
// night and decidedly not small over a month.
if (classesPresent.includes("forex")) {
  const fx = available.find((s) => assetClassOf(s) === "forex")!;
  const nightly = carryAtRollover(fx, Date.UTC(2026, 7, 11, 21, 0));
  const target = config.takeProfitPct * scaleOf(fx);
  const nights = config.dayTradingMode ? 0 : 5;
  const share = target > 0 ? (nightly * nights) / target : 0;
  add(
    "forex carry vs target",
    `${pct(nightly, 4)}/night`,
    config.dayTradingMode
      ? "day profile never holds overnight — no carry paid"
      : `${nights} nights = ${pct(nightly * nights, 3)} = ${(share * 100).toFixed(1)}% of target`,
    share > 0.25 ? "WARN" : "OK",
    share > 0.25
      ? "financing is a serious share of the target — shorten holds or check your real swap rates"
      : "financing is a minor share of the target",
  );
}

// --- 5. Limit offset against the bar range -----------------------------------
{
  // A maker offset wider than the typical bar range never gets touched, so
  // every entry is silently skipped.
  const ranges = available.map((s) => {
    const c = bars[s].slice(-100);
    return c.reduce((a, b) => a + (b.high - b.low) / b.close, 0) / c.length;
  });
  const medianRange = [...ranges].sort((a, b) => a - b)[Math.floor(ranges.length / 2)];
  const offset = config.limitOrderOffsetPct * scaleOf(available[0]);
  const ratio = medianRange > 0 ? offset / medianRange : Infinity;
  add(
    "limitOrderOffsetPct",
    pct(offset, 4),
    `typical bar range ${pct(medianRange, 3)} — offset is ${(ratio * 100).toFixed(0)}% of it`,
    ratio > 0.5 ? "WARN" : "OK",
    ratio > 0.5
      ? "wide relative to a bar — many entries will never fill"
      : "comfortably inside a typical bar's range",
  );
}

// --- 6. Correlation ceiling against reality ----------------------------------
if (available.length >= 2) {
  const pairs: number[] = [];
  for (let i = 0; i < available.length; i++) {
    for (let j = i + 1; j < available.length; j++) {
      pairs.push(correlation(returnsOf(bars[available[i]]), returnsOf(bars[available[j]])));
    }
  }
  const mean = pairs.reduce((a, v) => a + v, 0) / pairs.length;
  // Effective independent positions at this correlation — what a concurrency
  // limit should really be set against.
  const n = config.maxConcurrentPositions;
  const legs: RiskLeg[] = Array.from({ length: n }, (_, i) => ({ symbol: `S${i}`, weight: 1 / n, vol: 1 }));
  const effN = (1 / portfolioVolatility(legs, () => Math.max(0, mean))) ** 2;
  add(
    "maxConcurrentPositions",
    String(n),
    `mean pairwise correlation ${mean.toFixed(2)} → effective N = ${effN.toFixed(2)}`,
    effN < n * 0.5 ? "WARN" : "OK",
    effN < n * 0.5
      ? "positions are too alike to diversify — more of them buys fees, not safety"
      : "positions are diverse enough for the limit to mean something",
  );
}

// --- 7. Selector hysteresis vs the regime bonus ------------------------------
add(
  "SWITCH_MARGIN",
  String(SWITCH_MARGIN),
  `regime-fit bonus ${REGIME_FIT_BONUS}`,
  "OK",
  SWITCH_MARGIN > REGIME_FIT_BONUS
    ? "regime fit alone cannot flip an active incumbent (deliberate)"
    : "regime fit alone can trigger a switch",
);

// --- 8. Daily loss limit against daily movement ------------------------------
{
  // Rough per-day vol from per-bar vol, assuming 1-minute bars.
  const dailyVol = medianVol * Math.sqrt(1440);
  const sigmas = dailyVol > 0 ? config.dailyLossLimitPct / dailyVol : Infinity;
  add(
    "dailyLossLimitPct",
    pct(config.dailyLossLimitPct, 2),
    `~${pct(dailyVol, 2)} typical daily move → ${sigmas.toFixed(2)} sigma`,
    sigmas < 0.5 ? "WARN" : "OK",
    sigmas < 0.5
      ? "kill-switch sits inside ordinary daily noise — expect frequent halts"
      : "outside routine daily movement",
  );
}

// ---------------------------------------------------------------------------
const width = Math.max(...rows.map((r) => r.name.length));
for (const r of rows) {
  const tag = r.verdict === "OK" ? " ok  " : r.verdict === "WARN" ? " WARN" : "INERT";
  console.log(`[${tag}] ${r.name.padEnd(width)}  configured ${r.configured.padStart(9)}`);
  console.log(`         ${" ".repeat(width)}  measured   ${r.measured}`);
  if (r.note) console.log(`         ${" ".repeat(width)}  ${r.note}`);
  console.log();
}

const inert = rows.filter((r) => r.verdict === "INERT");
const warn = rows.filter((r) => r.verdict === "WARN");
console.log(
  inert.length
    ? `${inert.length} SETTING(S) CANNOT EVER BIND: ${inert.map((r) => r.name).join(", ")}\n` +
      `A control that never fires looks exactly like a calm market. Fix these first.`
    : warn.length
      ? `No inert settings. ${warn.length} worth a look: ${warn.map((r) => r.name).join(", ")}`
      : `All settings sit in a range where they can actually act.`,
);
process.exit(inert.length ? 1 : 0);
