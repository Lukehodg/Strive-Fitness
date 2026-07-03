import {
  dateFromDayOffset,
  formatCountdown,
  formatDayChip,
  formatDistance,
  formatRoster,
  formatStartTime,
} from "@/lib/format";

describe("formatDistance", () => {
  it("shows metres under 1km, rounded and floored at 50m", () => {
    expect(formatDistance(40)).toBe("50 m away");
    expect(formatDistance(120)).toBe("100 m away");
    expect(formatDistance(870)).toBe("850 m away");
  });

  it("shows km at/above 1km", () => {
    expect(formatDistance(1000)).toBe("1.0 km away");
    expect(formatDistance(3200)).toBe("3.2 km away");
    expect(formatDistance(9100)).toBe("9.1 km away");
  });

  it("drops the decimal beyond 10km", () => {
    expect(formatDistance(12000)).toBe("12 km away");
  });
});

describe("formatRoster", () => {
  it("formats joined / max", () => {
    expect(formatRoster(7, 10)).toBe("7 / 10 going");
    expect(formatRoster(0, 14)).toBe("0 / 14 going");
  });
});

describe("formatCountdown", () => {
  const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

  it("counts down in minutes under an hour", () => {
    expect(formatCountdown(iso(25 * 60_000), 60)).toBe("Starts in 25 min");
  });

  it("counts down in hours", () => {
    expect(formatCountdown(iso(3 * 3_600_000), 60)).toBe("Starts in 3h");
  });

  it("counts down in days", () => {
    expect(formatCountdown(iso(2 * 86_400_000), 60)).toBe("Starts in 2 days");
  });

  it("shows in-progress and finished states", () => {
    expect(formatCountdown(iso(-10 * 60_000), 60)).toBe("In progress");
    expect(formatCountdown(iso(-120 * 60_000), 60)).toBe("Finished");
  });
});

describe("formatStartTime", () => {
  const at = (d: Date) => d.toISOString();

  it("labels today", () => {
    const d = new Date();
    d.setHours(18, 30, 0, 0);
    expect(formatStartTime(at(d))).toMatch(/^Today /);
  });

  it("labels tomorrow", () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    expect(formatStartTime(at(d))).toMatch(/^Tomorrow /);
  });

  it("labels a weekday for further-out dates", () => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    const label = formatStartTime(at(d));
    expect(label).not.toMatch(/^Today |^Tomorrow /);
    expect(label).toMatch(/,/); // "Sat 21 Jun, 18:30"
  });
});

describe("dateFromDayOffset", () => {
  it("builds a date at the given offset and time", () => {
    const d = dateFromDayOffset(2, "18:30");
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(18);
    expect(d!.getMinutes()).toBe(30);
    const expected = new Date();
    expected.setDate(expected.getDate() + 2);
    expect(d!.getDate()).toBe(expected.getDate());
  });

  it("rejects invalid times", () => {
    expect(dateFromDayOffset(0, "25:00")).toBeNull();
    expect(dateFromDayOffset(0, "18:75")).toBeNull();
    expect(dateFromDayOffset(0, "not-a-time")).toBeNull();
  });
});

describe("formatDayChip", () => {
  afterEach(() => jest.useRealTimers());

  it("labels the first two offsets by name", () => {
    expect(formatDayChip(0)).toBe("Today");
    expect(formatDayChip(1)).toBe("Tomorrow");
  });

  it("labels further offsets with the real weekday", () => {
    // 2026-07-01 is a Wednesday, so +2 = Friday, +6 = the following Tuesday.
    jest.useFakeTimers().setSystemTime(new Date("2026-07-01T12:00:00Z"));
    expect(formatDayChip(2)).toBe("Fri");
    expect(formatDayChip(6)).toBe("Tue");
  });
});
