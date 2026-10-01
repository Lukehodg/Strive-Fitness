import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHealthOverview } from "../shared/health-overview";

const now = new Date("2026-10-01T10:00:00Z");
const connection = {
  provider: "whoop",
  status: "connected",
  lastSyncAt: now,
  lastError: null,
};
const reading = {
  provider: "whoop",
  day: "2026-10-01",
  score: 82,
  sleepMinutes: 472,
  hrv: 72,
  restingHeartRate: 52,
  calibrating: false,
  observedAt: now,
};
test("history retains calendar gaps and separates provider measurements", () => {
  const overview = buildHealthOverview(
    "2026-10-01",
    "Europe/London",
    [
      reading,
      { ...reading, provider: "oura", score: 74, restingHeartRate: null },
    ],
    [connection, { ...connection, provider: "oura" }],
    now,
  );
  assert.equal(overview.sources.length, 2);
  assert.equal(overview.sources[0].days.length, 28);
  assert.equal(overview.sources[0].days[0].day, "2026-09-04");
  assert.equal(overview.sources[0].days[26].hrv, null);
  assert.equal(overview.sources[0].current?.restingHeartRate, 52);
  assert.equal(overview.sources[1].current?.score, 74);
  assert.equal(overview.sources[1].current?.restingHeartRate, null);
});
test("stale, revoked, failed or future sync cannot provide current usable values", () => {
  for (const c of [
    { ...connection, lastSyncAt: new Date("2026-09-30") },
    { ...connection, status: "reconnect_required" },
    { ...connection, lastError: "rate_limited" },
    { ...connection, lastSyncAt: new Date(now.getTime() + 1) },
  ]) {
    const source = buildHealthOverview("2026-10-01", "UTC", [reading], [c], now)
      .sources[0];
    assert.equal(source.fresh, false);
    assert.equal(source.current, null);
    assert.equal(source.days[27].score, 82);
  }
});
test("future, out-of-range and calibrating readings do not become real measurements", () => {
  const rows = [
    { ...reading, day: "2026-10-02" },
    { ...reading, day: "2026-09-03" },
    { ...reading, day: "2026-09-30", observedAt: new Date(now.getTime() + 1) },
    { ...reading, calibrating: true },
  ];
  const source = buildHealthOverview(
    "2026-10-01",
    "UTC",
    rows,
    [connection],
    now,
  ).sources[0];
  assert.equal(source.current, null);
  assert.ok(
    source.days.every(
      (d) => d.score === null && d.hrv === null && d.restingHeartRate === null,
    ),
  );
  assert.equal(
    buildHealthOverview(
      "2026-10-01",
      "UTC",
      [reading],
      [{ ...connection, status: "disconnected" }],
      now,
    ).sources.length,
    0,
  );
});
test("missing today does not promote yesterday and partial readings stay independent", () => {
  const result = buildHealthOverview(
    "2026-10-01",
    "UTC",
    [{ ...reading, day: "2026-09-30" }],
    [connection],
    now,
  );
  assert.equal(result.sources[0].current, null);
  const partial = buildHealthOverview(
    "2026-10-01",
    "UTC",
    [{ ...reading, score: null, hrv: null, restingHeartRate: null }],
    [connection],
    now,
  );
  assert.equal(partial.sources[0].current?.sleepMinutes, 472);
  assert.equal(partial.sources[0].current?.score, null);
});
