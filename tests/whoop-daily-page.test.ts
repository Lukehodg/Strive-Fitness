import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dailyInterpretation,
  renderWhoopDaily,
  type DailyReading,
} from "../server/whoop-daily-page";
const readings: DailyReading[] = [
  { day: "2026-09-28", recovery: 60, sleepMinutes: 450, hrv: 40 },
  { day: "2026-09-29", recovery: 45, sleepMinutes: 420, hrv: 35 },
  { day: "2026-09-27", recovery: 70, sleepMinutes: 460, hrv: 50 },
  { day: "2026-09-26", recovery: 75, sleepMinutes: 470, hrv: 60 },
];
test("daily interpretation sorts readings without mutation and excludes today from prior HRV context", () => {
  const result = dailyInterpretation(readings, "2026-09-29");
  assert.equal(result.latest.day, "2026-09-29");
  assert.equal(result.average, 50);
  assert.equal(result.priorCount, 3);
  assert.equal(result.declining, true);
  assert.equal(readings[0].day, "2026-09-28");
});
test("missing, unscored and stale readings cannot support a current-day preview", () => {
  assert.equal(dailyInterpretation([], "2026-09-29").current, false);
  assert.equal(dailyInterpretation(readings, "2026-09-30").current, false);
  assert.equal(
    dailyInterpretation([{ ...readings[1], recovery: null }], "2026-09-29")
      .current,
    false,
  );
});
test("rendered coaching includes real inputs, explicit assumptions and executable interaction code", () => {
  const html = renderWhoopDaily(readings, "fixture-nonce", "2026-09-29");
  assert.ok(html.includes("45%"));
  assert.ok(html.includes("50.0 ms"));
  assert.ok(html.includes("training saved to your account"));
  assert.ok(html.includes('id="training-session"'));
  assert.ok(html.includes('id="choose" disabled'));
  const script = /<script nonce="fixture-nonce">([\s\S]*?)<\/script>/.exec(
    html,
  )![1];
  assert.doesNotThrow(() => new Function(script));
  assert.ok(script.includes("choose.disabled=!current||limited"));
  assert.ok(script.includes("el.hidden=limited||!current"));
});
