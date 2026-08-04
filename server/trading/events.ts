// Scheduled-event calendar and trading blackouts.
//
// The premise is deliberately modest. This does NOT try to predict what an
// event will do — that is the part nobody can do reliably. It only knows WHEN
// the scheduled ones happen, so the bot can avoid being caught in a leveraged
// position through a release that routinely moves crude 3% in ninety seconds.
//
// Not being in the trade is an edge you can actually verify. Predicting the
// print is not.
//
// TWO SOURCES OF TRUTH, deliberately separated:
//
//   1. RULE-DERIVED events, computed here from published schedules that are
//      genuinely stable ("EIA petroleum status, Wednesdays 10:30 ET, pushed to
//      Thursday when Monday was a federal holiday"). These never go stale.
//
//   2. DATED events — FOMC decisions, CPI prints, OPEC+ meetings — whose exact
//      dates are announced but not derivable. Those live in
//      server/data/eventCalendar.json and DO go stale.
//
// The distinction matters because a calendar that has quietly run out looks
// exactly like a calm market: no events, full size, straight into the print.
// So the loader tracks `validThrough` and isCalendarStale() is surfaced in the
// API and the dashboard rather than being logged once and forgotten.

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

export type EventKind =
  | "fomc"
  | "cpi"
  | "payrolls"
  | "eia_petroleum"
  | "eia_natgas"
  | "opec"
  | "triple_witching"
  | "other";

export interface MarketEvent {
  kind: EventKind;
  title: string;
  /** Epoch ms of the release. */
  at: number;
  /**
   * Which symbols this moves. "*" means broad market — everything, crypto
   * included, because a Fed decision moves BTC too.
   */
  scope: "*" | string[];
  /** Rough size of the typical move, used to scale the blackout window. */
  severity: "high" | "medium";
  /** Where the timing comes from, so a wrong window is traceable. */
  source: "rule" | "calendar";
}

/** Symbols in the traded universe most directly driven by crude. */
const OIL_SYMBOLS = ["XLE", "USO", "XOM", "CVX", "COP", "SLB", "OXY"];
/** Symbols driven by natural gas. */
const GAS_SYMBOLS = ["XLE", "UNG", "XOM"];

// ---------------------------------------------------------------------------
// Eastern-time helpers
//
// Every US release is published on a wall clock in America/New_York, which
// shifts by an hour twice a year. Hard-coding a UTC offset means every window
// is an hour wrong for roughly half the year — long enough to walk straight
// into a release you thought was an hour away.
// ---------------------------------------------------------------------------

const ET = "America/New_York";
const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23",
});

/** The America/New_York wall-clock fields for an instant. */
function etParts(ms: number) {
  const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second),
  };
}

/**
 * The instant at which the America/New_York wall clock reads the given time.
 *
 * Solved by iteration rather than a stored offset table: guess UTC, see what
 * the clock actually says there, correct by the difference. Two passes settle
 * it even across a DST boundary.
 */
export function etToUtc(
  year: number, month: number, day: number, hour: number, minute: number,
): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const p = etParts(guess);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const want = Date.UTC(year, month - 1, day, hour, minute);
    if (seen === want) break;
    guess += want - seen;
  }
  return guess;
}

/** Day of week in ET. 0 = Sunday. */
function etDow(year: number, month: number, day: number): number {
  return new Date(etToUtc(year, month, day, 12, 0)).getUTCDay();
}

/** The date of the nth given weekday of a month (n starts at 1). */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const firstDow = etDow(year, month, 1);
  return 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
}

/** The date of the last given weekday of a month. */
function lastWeekday(year: number, month: number, weekday: number): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDow = etDow(year, month, days);
  return days - ((lastDow - weekday + 7) % 7);
}

/**
 * US federal holidays, computed rather than listed so they never expire.
 * Needed because the EIA report slips a day whenever Monday is a holiday.
 */
function federalHolidays(year: number): Set<string> {
  const observed = (m: number, d: number): [number, number] => {
    // A holiday falling on Saturday is observed Friday, Sunday on Monday.
    const dow = etDow(year, m, d);
    if (dow === 6) return [m, d - 1];
    if (dow === 0) return [m, d + 1];
    return [m, d];
  };
  const days: Array<[number, number]> = [
    observed(1, 1),                            // New Year's Day
    [1, nthWeekday(year, 1, 1, 3)],            // MLK Day
    [2, nthWeekday(year, 2, 1, 3)],            // Presidents' Day
    [5, lastWeekday(year, 5, 1)],              // Memorial Day
    observed(6, 19),                           // Juneteenth
    observed(7, 4),                            // Independence Day
    [9, nthWeekday(year, 9, 1, 1)],            // Labor Day
    [10, nthWeekday(year, 10, 1, 2)],          // Columbus Day
    observed(11, 11),                          // Veterans Day
    [11, nthWeekday(year, 11, 4, 4)],          // Thanksgiving
    observed(12, 25),                          // Christmas Day
  ];
  return new Set(days.map(([m, d]) => `${m}-${d}`));
}

// ---------------------------------------------------------------------------
// Rule-derived events
// ---------------------------------------------------------------------------

/**
 * Every rule-derived event in a calendar year, memoized.
 *
 * The engine asks "is this symbol blacked out right now?" once per symbol per
 * tick — 40 symbols every 15 seconds. Deriving a year of events per question
 * measured at 7.8ms a call, so a single tick spent a third of a second
 * recomputing the same 120 dates. A year is a few hundred bytes; cache it.
 */
const yearCache = new Map<number, MarketEvent[]>();

function ruleEventsForYear(y: number): MarketEvent[] {
  const hit = yearCache.get(y);
  if (hit) return hit;

  const out: MarketEvent[] = [];
  const holidays = federalHolidays(y);
  const isHoliday = (m: number, d: number) => holidays.has(`${m}-${d}`);
  /**
   * Holiday test that normalises an out-of-range day into the correct
   * month — and year, so a Wednesday in early January looks back into the
   * previous December rather than off the end of the calendar.
   */
  const holidayCache = new Map<number, Set<string>>([[y, holidays]]);
  const isHolidayOn = (year: number, month: number, day: number): boolean => {
    const dt = new Date(Date.UTC(year, month - 1, day));
    const yy = dt.getUTCFullYear();
    let set = holidayCache.get(yy);
    if (!set) {
      set = federalHolidays(yy);
      holidayCache.set(yy, set);
    }
    return set.has(`${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`);
  };

  {
    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

      // Nonfarm payrolls: first Friday, 08:30 ET. Moves everything.
      out.push({
        kind: "payrolls",
        title: "US nonfarm payrolls",
        at: etToUtc(y, m, nthWeekday(y, m, 5, 1), 8, 30),
        scope: "*",
        severity: "high",
        source: "rule",
      });

      // Quarterly triple witching: third Friday of Mar/Jun/Sep/Dec, at the
      // close. Volume and pin risk, not direction.
      if ([3, 6, 9, 12].includes(m)) {
        out.push({
          kind: "triple_witching",
          title: "Quarterly triple witching",
          at: etToUtc(y, m, nthWeekday(y, m, 5, 3), 16, 0),
          scope: "*",
          severity: "medium",
          source: "rule",
        });
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const dow = etDow(y, m, d);

        // EIA Weekly Petroleum Status Report: Wednesday 10:30 ET, pushed to
        // Thursday when the Monday of that week was a federal holiday.
        //
        // The Monday lookup must cross month boundaries. isHoliday(m, d - 2)
        // indexed day 0 or -1 for a Wednesday falling on the 1st or 2nd, which
        // is never a holiday key, so the delay was silently missed whenever the
        // week straddled a month end. Verified against Memorial Day 2021
        // (Monday 31 May): the old code emitted a Wednesday 2 June release; the
        // actual report was Thursday 3 June.
        if (dow === 3 && !isHolidayOn(y, m, d - 2)) {
          out.push({
            kind: "eia_petroleum",
            title: "EIA weekly petroleum status",
            at: etToUtc(y, m, d, 10, 30),
            scope: OIL_SYMBOLS,
            severity: "high",
            source: "rule",
          });
        }
        if (dow === 4 && isHolidayOn(y, m, d - 3)) {
          out.push({
            kind: "eia_petroleum",
            title: "EIA weekly petroleum status (holiday delay)",
            at: etToUtc(y, m, d, 11, 0),
            scope: OIL_SYMBOLS,
            severity: "high",
            source: "rule",
          });
        }

        // EIA Natural Gas Storage: Thursday 10:30 ET.
        if (dow === 4) {
          out.push({
            kind: "eia_natgas",
            title: "EIA natural gas storage",
            at: etToUtc(y, m, d, 10, 30),
            scope: GAS_SYMBOLS,
            severity: "medium",
            source: "rule",
          });
        }
      }
    }
  }

  out.sort((a, b) => a.at - b.at);
  yearCache.set(y, out);
  return out;
}

/**
 * Events derivable from a standing published schedule, for the window
 * [from, to]. These are the ones that cannot go stale.
 */
export function ruleEvents(from: number, to: number): MarketEvent[] {
  const startYear = etParts(from).year;
  const endYear = etParts(to).year;
  const out: MarketEvent[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const e of ruleEventsForYear(y)) {
      if (e.at >= from && e.at <= to) out.push(e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dated calendar (FOMC, CPI, OPEC+) — announced, not derivable
// ---------------------------------------------------------------------------

interface CalendarFile {
  /** Beyond this instant the file is known to be incomplete. */
  validThrough: string;
  note: string;
  events: Array<{
    kind: EventKind; title: string; /** ISO, ET wall clock. */ etDateTime: string;
    scope?: string[]; severity?: "high" | "medium";
  }>;
}

let cached: CalendarFile | null = null;
let cacheFailed = false;

function loadCalendar(): CalendarFile | null {
  if (cached || cacheFailed) return cached;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "data", "eventCalendar.json"), "utf8");
    cached = JSON.parse(raw) as CalendarFile;
  } catch {
    cacheFailed = true;
    cached = null;
  }
  return cached;
}

/** For tests: forget the parsed file so the next call re-reads it. */
export function resetCalendarCache(): void {
  cached = null;
  cacheFailed = false;
}

/**
 * True when the dated calendar no longer covers `now`, meaning FOMC and CPI
 * blackouts have silently stopped happening. Surfaced, not swallowed.
 */
export function isCalendarStale(now = Date.now()): boolean {
  const cal = loadCalendar();
  if (!cal) return true;
  return now > Date.parse(cal.validThrough);
}

export function calendarValidThrough(): number | null {
  const cal = loadCalendar();
  return cal ? Date.parse(cal.validThrough) : null;
}

function calendarEvents(from: number, to: number): MarketEvent[] {
  const cal = loadCalendar();
  if (!cal) return [];
  return cal.events
    .map((e) => {
      // "2026-09-17T14:00" is an ET wall clock, not UTC — parsing it as UTC
      // would put every FOMC decision four or five hours early.
      const [date, time] = e.etDateTime.split("T");
      const [Y, M, D] = date.split("-").map(Number);
      const [h, mi] = (time ?? "00:00").split(":").map(Number);
      return {
        kind: e.kind,
        title: e.title,
        at: etToUtc(Y, M, D, h, mi),
        scope: (e.scope ?? "*") as "*" | string[],
        severity: e.severity ?? "high",
        source: "calendar" as const,
      };
    })
    .filter((e) => e.at >= from && e.at <= to);
}

/** Every known event in [from, to], both sources merged, soonest first. */
export function eventsBetween(from: number, to: number): MarketEvent[] {
  return [...ruleEvents(from, to), ...calendarEvents(from, to)].sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// Blackout
// ---------------------------------------------------------------------------

export interface BlackoutSettings {
  /** Stop opening positions this many minutes before a high-severity event. */
  beforeMinutes: number;
  /** Keep standing down this many minutes after it, while the spread is wide. */
  afterMinutes: number;
}

export const DEFAULT_BLACKOUT: BlackoutSettings = { beforeMinutes: 30, afterMinutes: 15 };

export interface BlackoutVerdict {
  blocked: boolean;
  event: MarketEvent | null;
  /** Minutes until the event; negative means it has already happened. */
  minutesAway: number;
  reason: string;
}

const NOT_BLOCKED: BlackoutVerdict = {
  blocked: false, event: null, minutesAway: Infinity, reason: "",
};

function affects(event: MarketEvent, symbol: string): boolean {
  if (event.scope === "*") return true;
  // Scope lists are equity tickers; compare on the bare ticker so "XLE" still
  // matches however the broker happens to spell it.
  const bare = symbol.replace("/USD", "").replace("USD", "");
  return event.scope.includes(symbol) || event.scope.includes(bare);
}

/**
 * Should a NEW position in `symbol` be opened right now?
 *
 * Only entries are gated. An open position is left alone: closing it into the
 * same illiquid pre-release book is not obviously safer than holding through,
 * and the stop is already at the venue.
 *
 * A medium-severity event gets half the window — enough to skip the worst of
 * the spread without standing down for a third of the session.
 */
export function checkBlackout(
  symbol: string,
  now: number,
  settings: BlackoutSettings = DEFAULT_BLACKOUT,
): BlackoutVerdict {
  const window = Math.max(settings.beforeMinutes, settings.afterMinutes) * 60_000;
  const nearby = eventsBetween(now - window, now + window);

  for (const event of nearby) {
    if (!affects(event, symbol)) continue;
    const scale = event.severity === "high" ? 1 : 0.5;
    const before = settings.beforeMinutes * 60_000 * scale;
    const after = settings.afterMinutes * 60_000 * scale;
    if (now >= event.at - before && now <= event.at + after) {
      const minutesAway = (event.at - now) / 60_000;
      return {
        blocked: true,
        event,
        minutesAway,
        reason:
          minutesAway >= 0
            ? `${event.title} in ${Math.round(minutesAway)}m — no new entries`
            : `${event.title} ${Math.round(-minutesAway)}m ago — waiting for the spread to settle`,
      };
    }
  }
  return NOT_BLOCKED;
}

/**
 * The next broad-market ("*") event, used for the global confidence factor.
 * Per-symbol events are handled by checkBlackout at entry time instead.
 */
export function nextBroadEvent(now: number, horizonMinutes = 240): MarketEvent | null {
  const upcoming = eventsBetween(now, now + horizonMinutes * 60_000);
  return upcoming.find((e) => e.scope === "*") ?? null;
}
