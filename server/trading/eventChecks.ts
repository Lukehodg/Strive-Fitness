// Event-calendar checks. Run: npx tsx server/trading/eventChecks.ts
//
// Almost everything here is date arithmetic across a DST boundary, which is
// exactly the kind of code that looks right and is an hour wrong for half the
// year. So the checks assert against the America/New_York wall clock, not
// against a UTC offset.

import {
  etToUtc, ruleEvents, eventsBetween, checkBlackout, nextBroadEvent,
  isCalendarStale, DEFAULT_BLACKOUT, type MarketEvent,
} from "./events";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const ET = "America/New_York";
const wall = (ms: number) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: ET, weekday: "short", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(ms);

// --- etToUtc across DST ------------------------------------------------------
// EST is UTC-5, EDT is UTC-4. 10:30 ET in January and in July are different
// UTC instants; a fixed offset gets one of them wrong.
const jan = etToUtc(2026, 1, 14, 10, 30);
const jul = etToUtc(2026, 7, 15, 10, 30);
check("winter 10:30 ET is 15:30 UTC (EST)", new Date(jan).toISOString().includes("T15:30"),
  new Date(jan).toISOString());
check("summer 10:30 ET is 14:30 UTC (EDT)", new Date(jul).toISOString().includes("T14:30"),
  new Date(jul).toISOString());
check("round-trips back to the same wall clock", wall(jan).includes("10:30") && wall(jul).includes("10:30"));

// --- rule events: a full year ------------------------------------------------
const yearFrom = Date.UTC(2026, 0, 1);
const yearTo = Date.UTC(2026, 11, 31, 23, 59);
const year = ruleEvents(yearFrom, yearTo);

const payrolls = year.filter((e) => e.kind === "payrolls");
check("12 payrolls prints in a year", payrolls.length === 12, `${payrolls.length}`);
check("every payrolls print is a Friday at 08:30 ET",
  payrolls.every((e) => wall(e.at).startsWith("Fri") && wall(e.at).includes("08:30")),
  wall(payrolls[0].at));
check("payrolls falls in the first 7 days of its month",
  payrolls.every((e) => {
    const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: ET, day: "numeric" }).format(e.at));
    return day <= 7;
  }));

const petro = year.filter((e) => e.kind === "eia_petroleum");
check("~52 petroleum reports in a year", petro.length >= 50 && petro.length <= 53, `${petro.length}`);
check("petroleum reports land Wednesday or Thursday",
  petro.every((e) => wall(e.at).startsWith("Wed") || wall(e.at).startsWith("Thu")));
check("petroleum reports are 10:30 ET (or 11:00 on a holiday slip)",
  petro.every((e) => wall(e.at).includes("10:30") || wall(e.at).includes("11:00")));

// The week of Memorial Day (last Monday in May) has no Wednesday report; it
// slips to Thursday. If the holiday logic is wrong this silently reverts to a
// normal Wednesday and the blackout misses the release entirely.
const may = petro.filter((e) => wall(e.at).includes("/2026") && wall(e.at).slice(5, 7) === "05");
const memorialWeek = may.filter((e) => {
  const d = Number(new Intl.DateTimeFormat("en-US", { timeZone: ET, day: "numeric" }).format(e.at));
  return d >= 25 && d <= 31;
});
check("Memorial Day week's report slips to Thursday",
  memorialWeek.length === 1 && wall(memorialWeek[0].at).startsWith("Thu"),
  memorialWeek.map((e) => wall(e.at)).join(", ") || "none found");

// Independence Day 2026 is Saturday 4 July, observed Friday 3 July — a Monday
// holiday is what moves the report, so that week should NOT slip.
const julyWeek = petro.filter((e) => {
  const w = wall(e.at);
  return w.slice(5, 7) === "07" && Number(w.slice(8, 10)) <= 8;
});
check("a Friday-observed holiday does not move the report",
  julyWeek.every((e) => wall(e.at).startsWith("Wed")),
  julyWeek.map((e) => wall(e.at)).join(", "));

// --- the month-boundary case the original checks missed ----------------------
// Memorial Day 2021 fell on Monday 31 May, so that week's report slipped to
// Thursday 3 June. The Monday lookup used to be isHoliday(m, d - 2), which for
// Wednesday 2 June indexed "6-0" — never a holiday key — so the delay was
// silently dropped whenever the week straddled a month end.
const y2021 = ruleEvents(Date.UTC(2021, 4, 25), Date.UTC(2021, 5, 8))
  .filter((e) => e.kind === "eia_petroleum");
const walls2021 = y2021.map((e) => wall(e.at));
check("Memorial Day 2021 (Mon 31 May) delays the report across the month boundary",
  walls2021.some((w) => w.startsWith("Thu") && w.includes("06/03")) &&
  !walls2021.some((w) => w.includes("06/02")),
  walls2021.join(", ") || "none");

// New Year's Day always lands in the previous year for an early-January
// Wednesday, exercising the year rollover too.
const jan2026 = ruleEvents(Date.UTC(2025, 11, 29), Date.UTC(2026, 0, 9))
  .filter((e) => e.kind === "eia_petroleum");
check("an early-January week resolves holidays without falling off the calendar",
  jan2026.every((e) => Number.isFinite(e.at)),
  jan2026.map((e) => wall(e.at)).join(", "));

const witching = year.filter((e) => e.kind === "triple_witching");
check("4 triple witchings a year, all Friday", witching.length === 4 &&
  witching.every((e) => wall(e.at).startsWith("Fri")), `${witching.length}`);

// --- ordering and windowing --------------------------------------------------
check("events come back in chronological order",
  year.every((e, i) => i === 0 || e.at >= year[i - 1].at));
const narrow = eventsBetween(jan, jan + 60_000);
check("a one-minute window returns only events inside it",
  narrow.every((e) => e.at >= jan && e.at <= jan + 60_000));

// --- blackout ----------------------------------------------------------------
const oilEvent = petro.find((e) => wall(e.at).includes("10:30"))!;
const T = oilEvent.at;

check("oil symbol is blocked 20m before an EIA print",
  checkBlackout("XLE", T - 20 * 60_000).blocked);
check("oil symbol is blocked 5m after it",
  checkBlackout("XLE", T + 5 * 60_000).blocked);
check("oil symbol is clear 45m before (outside the 30m window)",
  !checkBlackout("XLE", T - 45 * 60_000).blocked);
check("oil symbol is clear 30m after (outside the 15m window)",
  !checkBlackout("XLE", T + 30 * 60_000).blocked);
check("an unrelated symbol is NOT blocked by an oil-only event",
  !checkBlackout("AAPL", T - 20 * 60_000).blocked, checkBlackout("AAPL", T - 20 * 60_000).reason);

const nfp = payrolls[3];
check("a broad-market event blocks equities",
  checkBlackout("AAPL", nfp.at - 10 * 60_000).blocked);
check("a broad-market event also blocks crypto (macro moves BTC too)",
  checkBlackout("BTC/USD", nfp.at - 10 * 60_000).blocked);

// Medium severity gets half the window — worth asserting, because getting the
// scale backwards would stand the bot down for twice as long as intended.
const gas = year.find((e) => e.kind === "eia_natgas")!;
check("medium severity uses half the window",
  checkBlackout("UNG", gas.at - 20 * 60_000).blocked === false &&
  checkBlackout("UNG", gas.at - 10 * 60_000).blocked === true);

check("the reason says what and when",
  /in \d+m/.test(checkBlackout("XLE", T - 20 * 60_000).reason),
  checkBlackout("XLE", T - 20 * 60_000).reason);
check("after the event the reason says so",
  /ago/.test(checkBlackout("XLE", T + 5 * 60_000).reason),
  checkBlackout("XLE", T + 5 * 60_000).reason);

// --- scope matching ----------------------------------------------------------
check("crypto spelling still matches an equity-ticker scope list",
  checkBlackout("XLE/USD", T - 10 * 60_000).blocked);

// --- next broad event --------------------------------------------------------
const nb = nextBroadEvent(nfp.at - 60 * 60_000, 240);
check("nextBroadEvent finds the upcoming print", nb?.kind === "payrolls", nb?.title ?? "none");
check("nextBroadEvent ignores symbol-scoped events",
  nextBroadEvent(T - 10 * 60_000, 60)?.kind !== "eia_petroleum");

// --- staleness is reported, not swallowed ------------------------------------
check("the shipped calendar reports itself stale (it ships empty on purpose)",
  isCalendarStale(Date.now()));

// --- cost of the check on the hot path ---------------------------------------
const t0 = performance.now();
for (let i = 0; i < 200; i++) checkBlackout("XLE", Date.now() + i * 60_000);
const per = (performance.now() - t0) / 200;
check("checkBlackout is cheap enough for the tick loop", per < 5, `${per.toFixed(2)}ms per call`);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures ? 1 : 0);
