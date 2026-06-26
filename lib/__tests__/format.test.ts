import { formatDistance, formatRoster, formatStartTime } from "@/lib/format";

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
