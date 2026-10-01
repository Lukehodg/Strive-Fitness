import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { coachRecommendationSchema } from "../shared/coach";

delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";
await mkdir(".test-data", { recursive: true });
const databasePath = await mkdtemp(resolve(".test-data", "coach-"));
process.env.LOCAL_DATABASE_PATH = databasePath;
const { db, migrateDatabase, closeDatabase } = await import("../server/db");
const { createApp } = await import("../server/app");
const { seedCatalogue } = await import("../server/seed");
const s = await import("../shared/schema");
const { eq, and } = await import("drizzle-orm");
const { readContext } = await import("../server/coach/context");
let server: Awaited<ReturnType<typeof createApp>>["server"];
let base: string, alice: string, bob: string;
let userId: number, templateId: number, exerciseId: number;
async function call(path: string, method = "GET", body?: unknown, token = alice) {
  return fetch(base + path, { method, headers: {
    "Content-Type": "application/json", "X-Strive-Request": "1", "X-Strive-Client": "native",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function checkin(energy = "usual", limited = false) {
  assert.equal((await call("/api/check-in", "POST", { energy, limited, soreness: "none" })).status, 200);
}
async function preview(requestKey = randomUUID(), id = templateId) {
  const response = await call("/api/coach/recommendations", "POST", { requestKey, templateId: id });
  const body = await response.json();
  assert.ok(response.status === 200 || response.status === 201, JSON.stringify(body));
  assert.equal(response.headers.get("cache-control"), "no-store");
  return coachRecommendationSchema.parse(body);
}
before(async () => {
  await migrateDatabase();
  await migrateDatabase();
  await seedCatalogue();
  ({ server } = await createApp());
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const name of ["alice", "bob"]) {
    const response = await call("/api/auth/signup", "POST", {
      email: `${name}@coach.test`, password: "test-long-password", displayName: name, timezone: "Europe/London",
    }, "");
    assert.equal(response.status, 201);
    const data = await response.json();
    if (name === "alice") { alice = data.token; userId = data.user.id; } else bob = data.token;
  }
  const exercises = await (await call("/api/exercises")).json();
  exerciseId = exercises.find((e: { measurementType: string }) => e.measurementType === "weight_reps").id;
  const response = await call("/api/training/templates", "POST", {
    requestKey: randomUUID(), name: "Coach test session", duration: 40, scheduledDay: null,
    exercises: [{ exerciseId, sets: 4, repsMin: 8, repsMax: 10, restSeconds: 90 }],
  });
  assert.equal(response.status, 201);
  templateId = (await response.json()).id;
});
after(async () => {
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  await closeDatabase();
  const reopened = new PGlite(databasePath);
  const result = await reopened.query<{ count: number }>("select count(*)::int as count from coach_recommendations");
  assert.ok(result.rows[0].count > 0, "Recommendations survive database restart");
  await reopened.close();
});

test("beta health probes disclose no records and signup honours the invitation allowlist", async () => {
  assert.deepEqual(await (await call("/healthz", "GET", undefined, "")).json(), { status: "ok" });
  assert.deepEqual(await (await call("/readyz", "GET", undefined, "")).json(), { status: "ready" });
  const prior = process.env.BETA_ALLOWED_EMAILS;
  process.env.BETA_ALLOWED_EMAILS = " invited@coach.test ";
  try {
    assert.equal((await call("/api/auth/signup", "POST", { email: "excluded@coach.test", password: "long-password", displayName: "Excluded" }, "")).status, 403);
    assert.equal((await call("/api/auth/signup", "POST", { email: "INVITED@coach.test", password: "long-password", displayName: "Invited" }, "")).status, 201);
  } finally { if (prior === undefined) delete process.env.BETA_ALLOWED_EMAILS; else process.env.BETA_ALLOWED_EMAILS = prior; }
});

test("coach GET is read-only; no check-in cannot produce an actionable workout", async () => {
  const today = await (await call("/api/coach/today")).json();
  assert.equal(today.recommendation, null);
  assert.equal((await db.select().from(s.coachRecommendations)).length, 0);
  const result = await preview();
  assert.equal(result.status, "needs_check_in");
  assert.equal(result.proposed, null);
  assert.equal(result.stale, false);
  assert.equal(result.original.exercises[0].sets, 4);
});

test("missing wearable stays unknown; lower energy reduces sets without changing targets or templates", async () => {
  await checkin();
  const normal = await preview();
  assert.equal(normal.status, "ready");
  assert.equal(normal.inputs.readiness.mode, "unknown");
  assert.deepEqual(normal.proposed, normal.original);
  assert.equal(normal.proposed!.estimatedMinutes, null);
  await checkin("low");
  const lower = await preview();
  assert.equal(lower.proposed!.exercises[0].sets, 3);
  assert.equal(lower.proposed!.exercises[0].repsMin, 8);
  assert.equal(lower.proposed!.exercises[0].restSeconds, 90);
  assert.deepEqual(lower.changes, [{ exerciseId, field: "sets", before: 4, after: 3 }]);
  const [templateExercise] = await db.select().from(s.workoutTemplateExercises).where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId));
  assert.equal(templateExercise.sets, 4);
  assert.equal((await db.select().from(s.completedWorkouts)).length, 0);
});

test("ownership, authentication and strict inputs are enforced", async () => {
  const own = await preview();
  assert.equal((await call(`/api/coach/recommendations/${own.id}`, "GET", undefined, bob)).status, 404);
  assert.equal((await call("/api/coach/recommendations", "POST", { requestKey: randomUUID(), templateId }, bob)).status, 404);
  assert.equal((await call("/api/coach/today", "GET", undefined, "")).status, 401);
  assert.equal((await call("/api/coach/recommendations", "POST", { requestKey: randomUUID(), templateId, userId })).status, 400);
  assert.equal((await call("/api/coach/recommendations", "POST", { requestKey: randomUUID(), templateId, exercises: [] })).status, 400);
  const other = await (await call("/api/coach/today", "GET", undefined, bob)).json();
  assert.equal(other.recommendation, null);
  assert.deepEqual(other.templates, []);
});

test("concurrent retries create one immutable record and conflicting payloads fail", async () => {
  const key = randomUUID();
  const [a, b] = await Promise.all([preview(key), preview(key)]);
  assert.equal(a.id, b.id);
  assert.equal((await db.select().from(s.coachRecommendations).where(and(eq(s.coachRecommendations.userId, userId), eq(s.coachRecommendations.requestKey, key)))).length, 1);
  assert.equal((await call("/api/coach/recommendations", "POST", { requestKey: key, templateId: templateId + 999 })).status, 409);
  await checkin("usual");
  const retry = await preview(key);
  assert.equal(retry.id, a.id);
  assert.equal(retry.staleReason, "inputs_changed");
  assert.deepEqual(retry.proposed, a.proposed);
  assert.deepEqual(retry.reasons, a.reasons);
});

test("limiting symptoms block proposals; template edits mark old previews stale without rewriting them", async () => {
  await checkin("usual", true);
  const blocked = await preview();
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.proposed, null);
  await checkin();
  const original = await preview();
  await db.update(s.workoutTemplateExercises).set({ sets: 1 }).where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId));
  const old = await (await call(`/api/coach/recommendations/${original.id}`)).json();
  assert.equal(old.staleReason, "inputs_changed");
  assert.equal(old.original.exercises[0].sets, 4);
  await checkin("low");
  const minimum = await preview();
  assert.equal(minimum.proposed!.exercises[0].sets, 1);
  assert.deepEqual(minimum.changes, []);
});

test("source expiry, revocation and changed readings invalidate previews; credentials never appear", async () => {
  await checkin();
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  await db.insert(s.wearableConnections).values({ userId, provider: "whoop", status: "connected", lastSyncAt: now, credentials: "PRIVATE_TEST_SENTINEL" });
  await db.insert(s.wearableDays).values({ userId, provider: "whoop", day, sourceId: "test-source", score: 20, sleepMinutes: 360, hrv: 40, observedAt: now });
  const original = await preview();
  assert.equal(original.inputs.readiness.mode, "ease");
  assert.equal(JSON.stringify(original).includes("PRIVATE_TEST_SENTINEL"), false);
  const stored = await db.select().from(s.coachRecommendations).where(eq(s.coachRecommendations.id, original.id));
  assert.equal(JSON.stringify(stored).includes("PRIVATE_TEST_SENTINEL"), false);
  await db.update(s.wearableDays).set({ hrv: 41 }).where(eq(s.wearableDays.userId, userId));
  assert.equal((await (await call(`/api/coach/recommendations/${original.id}`)).json()).stale, true);
  await db.update(s.wearableConnections).set({ lastSyncAt: new Date(now.getTime() - 13 * 3600_000) }).where(eq(s.wearableConnections.userId, userId));
  const staleSource = await preview();
  assert.equal(staleSource.inputs.readiness.mode, "unknown");
  assert.equal(staleSource.inputs.readiness.sources[0].usable, false);
  await db.update(s.wearableConnections).set({ status: "disconnected" }).where(eq(s.wearableConnections.userId, userId));
  assert.equal((await (await call(`/api/coach/recommendations/${staleSource.id}`)).json()).stale, true);
});

test("expiry and timezone changes are reported; local day changes alter context identity", async () => {
  const result = await preview();
  await db.update(s.coachRecommendations).set({ expiresAt: new Date(0) }).where(eq(s.coachRecommendations.id, result.id));
  assert.equal((await (await call(`/api/coach/recommendations/${result.id}`)).json()).staleReason, "expired");
  const fresh = await preview();
  await db.update(s.users).set({ timezone: "America/New_York" }).where(eq(s.users.id, userId));
  assert.equal((await (await call(`/api/coach/recommendations/${fresh.id}`)).json()).staleReason, "inputs_changed");
  const [a, b] = await db.transaction(async tx => [
    await readContext(tx, userId, templateId, new Date("2026-09-29T03:59:00Z")),
    await readContext(tx, userId, templateId, new Date("2026-09-29T04:01:00Z")),
  ], { isolationLevel: "repeatable read" });
  assert.equal(a!.inputs.day, "2026-09-28");
  assert.equal(b!.inputs.day, "2026-09-29");
  assert.notEqual(a!.inputHash, b!.inputHash);
});

test("acceptance is durable and idempotent, and concurrent starts log the exact accepted plan", async () => {
  await checkin("low");
  const created = await call("/api/training/templates", "POST", {
    requestKey: randomUUID(), name: "Accepted plan", duration: 40, scheduledDay: null,
    exercises: [{ exerciseId, sets: 4, repsMin: 8, repsMax: 10, restSeconds: 90 }],
  });
  const selected = (await created.json()).id;
  const proposal = await preview(randomUUID(), selected);
  const decide = () => call(`/api/coach/recommendations/${proposal.id}/decision`, "POST", { choice: "proposed" });
  const responses = await Promise.all([decide(), decide()]);
  for (const response of responses) assert.equal(response.status, 200);
  const [a, b] = await Promise.all(responses.map((response) => response.json()));
  assert.equal(a.decision.id, b.decision.id);
  assert.equal(a.decision.sessionId, null);
  const restored = await (await call(`/api/coach/recommendations/${proposal.id}`)).json();
  assert.equal(restored.decision.id, a.decision.id);
  assert.equal((await call(`/api/coach/recommendations/${proposal.id}/decision`, "POST", { choice: "original" })).status, 409);
  assert.equal((await call(`/api/coach/decisions/${a.decision.id}/start`, "POST", {}, bob)).status, 404);
  const starts = await Promise.all([0, 1].map(() => call(`/api/coach/decisions/${a.decision.id}/start`, "POST", {})));
  for (const response of starts) assert.equal(response.status, 200, await response.clone().text());
  const [first, second] = await Promise.all(starts.map((r) => r.json()));
  assert.equal(first.id, second.id);
  assert.deepEqual(first.planSnapshot.exercises, proposal.proposed!.exercises);
  assert.equal(first.planSnapshot.coach.recommendationId, proposal.id);
  await checkin("usual", true);
  const resumed = await (await call(`/api/coach/decisions/${a.decision.id}/start`, "POST", {})).json();
  assert.equal(resumed.id, first.id);
  assert.deepEqual(resumed.planSnapshot, first.planSnapshot);
  assert.equal((await call(`/api/training/sessions/${first.id}/sets`, "PUT", { exerciseId, setNumber: 1, weight: 20, reps: 8, rpe: 7 })).status, 200);
  assert.equal((await call(`/api/training/sessions/${first.id}/finish`, "POST", {})).status, 200);
  const completed = await (await call(`/api/coach/decisions/${a.decision.id}/start`, "POST", {})).json();
  assert.equal(completed.id, first.id);
  assert.equal(completed.isCompleted, true);
});

test("acceptance and start revalidate changed inputs, and another active session is never overwritten", async () => {
  await checkin();
  const proposal = await preview();
  assert.equal((await call(`/api/coach/recommendations/${proposal.id}/decision`, "POST", { choice: "proposed" }, bob)).status, 404);
  await checkin("low");
  assert.equal((await call(`/api/coach/recommendations/${proposal.id}/decision`, "POST", { choice: "proposed" })).status, 409);
  const fresh = await preview();
  const accepted = await (await call(`/api/coach/recommendations/${fresh.id}/decision`, "POST", { choice: "proposed" })).json();
  await checkin("usual", true);
  assert.equal((await call(`/api/coach/decisions/${accepted.decision.id}/start`, "POST", {})).status, 409);
  const blocked = await preview();
  assert.equal((await call(`/api/coach/recommendations/${blocked.id}/decision`, "POST", { choice: "original" })).status, 409);
  await checkin();
  const valid = await preview();
  const choice = await (await call(`/api/coach/recommendations/${valid.id}/decision`, "POST", { choice: "original" })).json();
  const active = await (await call(`/api/training/templates/${templateId}/start`, "POST", {})).json();
  assert.equal((await call(`/api/coach/decisions/${choice.decision.id}/start`, "POST", {})).status, 409);
  // Cleanup the manual test session so the separate template-deletion test remains valid.
  await db.delete(s.completedWorkouts).where(eq(s.completedWorkouts.id, active.id));
});

test("dated plans deduplicate, preserve rescheduling and isolate completed weeks", async () => {
  const today = (await (await call("/api/coach/today")).json()).day;
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long" }).format(new Date(today));
  const made = await call("/api/training/templates", "POST", {
    requestKey: randomUUID(), name: "Dated plan", duration: 30, scheduledDay: weekday,
    exercises: [{ exerciseId, sets: 2, repsMin: 8, repsMax: 10, restSeconds: 90 }],
  });
  const planTemplateId = (await made.json()).id;
  const build = () => call("/api/planning/build", "POST", { start: today, weeks: 4 });
  assert.equal((await (await build()).json()).added, 4);
  assert.equal((await (await build()).json()).added, 0);
  const week = await (await call(`/api/planning/week?start=${today}`)).json();
  const entry = week.workouts.find((w: { templateId: number }) => w.templateId === planTemplateId);
  assert.equal(entry.status, "planned");
  assert.equal((await (await call(`/api/planning/week?start=${today}`, "GET", undefined, bob)).json()).workouts.length, 0);
  assert.equal((await call(`/api/planning/workouts/${entry.id}`, "PATCH", { revision: 0, skipped: true }, bob)).status, 409);
  await checkin("usual");
  const previewResponse = await call("/api/coach/recommendations", "POST", { requestKey: randomUUID(), templateId: planTemplateId, scheduledId: entry.id });
  assert.equal(previewResponse.status, 201);
  const proposal = await previewResponse.json();
  const choice = await (await call(`/api/coach/recommendations/${proposal.id}/decision`, "POST", { choice: "proposed" })).json();
  const started = await call(`/api/coach/decisions/${choice.decision.id}/start`, "POST", {});
  assert.equal(started.status, 200, await started.clone().text());
  const session = await started.json();
  assert.equal((await call(`/api/planning/workouts/${entry.id}`, "PATCH", { revision: 1, skipped: true })).status, 409);
  const activeWeek = await (await call(`/api/planning/week?start=${today}`)).json();
  assert.equal(activeWeek.workouts.find((w: { id: number }) => w.id === entry.id).sessionId, session.id);
  assert.equal((await call(`/api/training/sessions/${session.id}/feedback`, "PUT", { difficulty: "about_right" })).status, 409);
  await call(`/api/training/sessions/${session.id}/finish`, "POST", {});
  assert.equal((await call(`/api/training/sessions/${session.id}/feedback`, "PUT", { difficulty: "too_hard", note: "Too much today" })).status, 200);
  assert.equal((await call(`/api/training/sessions/${session.id}/feedback`, "PUT", { difficulty: "about_right" }, bob)).status, 404);
  const feedback = await (await call(`/api/training/sessions/${session.id}/feedback`)).json();
  assert.equal(feedback.difficulty, "too_hard");
  const completedWeek = await (await call(`/api/planning/week?start=${today}`)).json();
  assert.equal(completedWeek.workouts.find((w: { id: number }) => w.id === entry.id).status, "completed");
  const nextDate = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const next = (await (await call(`/api/planning/week?start=${nextDate}`)).json()).workouts[0];
  assert.equal(next.status, "planned"); assert.equal(next.sessionId, null);
  const movedDate = new Date(Date.parse(today) + 8 * 86400000).toISOString().slice(0, 10);
  assert.equal((await call(`/api/planning/workouts/${next.id}`, "PATCH", { revision: next.revision, day: movedDate })).status, 200);
  assert.equal((await call(`/api/planning/workouts/${next.id}`, "PATCH", { revision: next.revision, skipped: true })).status, 409);
  assert.equal((await (await build()).json()).added, 0);
  const afterMove = (await (await call(`/api/planning/week?start=${nextDate}`)).json()).workouts;
  assert.equal(afterMove.length, 1); assert.equal(afterMove[0].day, movedDate);
});

test("workout editing checks versions and ownership, and preserves existing session snapshots", async () => {
  const created = await call("/api/training/templates", "POST", { requestKey: randomUUID(), name: "Edit test", duration: 25, scheduledDay: null,
    exercises: [{ exerciseId, sets: 2, repsMin: 6, repsMax: 8, restSeconds: 60 }] });
  const template = await created.json();
  const initial = await (await call(`/api/training/templates/${template.id}`)).json();
  assert.equal((await call(`/api/training/templates/${template.id}`, "GET", undefined, bob)).status, 404);
  const active = await (await call(`/api/training/templates/${template.id}/start`, "POST", {})).json();
  const edited = { version: initial.version, name: "Edited plan", duration: 35, scheduledDay: "Monday",
    exercises: [{ exerciseId, sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 }] };
  assert.equal((await call(`/api/training/templates/${template.id}`, "PUT", edited, bob)).status, 404);
  const changed = await call(`/api/training/templates/${template.id}`, "PUT", edited);
  assert.equal(changed.status, 200);
  assert.notEqual((await changed.json()).version, initial.version);
  assert.equal((await call(`/api/training/templates/${template.id}`, "PUT", edited)).status, 409);
  const session = await (await call(`/api/training/sessions/${active.id}`)).json();
  assert.equal(session.workout.planSnapshot.name, "Edit test");
  assert.equal(session.workout.planSnapshot.exercises[0].sets, 2);
  await call(`/api/training/sessions/${active.id}/finish`, "POST", {});
});

test("deleted template leaves an inspectable, stale historical snapshot", async () => {
  const record = await preview();
  await db.delete(s.workoutTemplateExercises).where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId));
  await db.delete(s.workoutTemplates).where(eq(s.workoutTemplates.id, templateId));
  const historical = await (await call(`/api/coach/recommendations/${record.id}`)).json();
  assert.equal(historical.staleReason, "template_unavailable");
  assert.deepEqual(historical.original, record.original);
});
