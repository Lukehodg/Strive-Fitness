import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";

delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.PUBLIC_API_URL = "https://strive.example.com";
process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.WHOOP_CLIENT_ID = "fixture-whoop-client";
process.env.WHOOP_CLIENT_SECRET = "fixture-whoop-secret";
process.env.OURA_CLIENT_ID = "fixture-oura-client";
process.env.OURA_CLIENT_SECRET = "fixture-oura-secret";
await mkdir(".test-data", { recursive: true });
process.env.LOCAL_DATABASE_PATH = await mkdtemp(
  resolve(".test-data", "wearables-"),
);
const { db, migrateDatabase, closeDatabase } = await import("../server/db");
const { createApp } = await import("../server/app");
const { syncWearables } = await import("../server/wearables");
const { seal, unseal, providerClient, ProviderError } =
  await import("../server/wearable-providers");
const { assessReadiness } = await import("../server/readiness");
const {
  wearableConnections: connections,
  wearableDays: days,
  wearableAuthorizations: attempts,
  exercises,
  workoutTemplates,
} = await import("../shared/schema");
const { eq, and } = await import("drizzle-orm");
let server: Awaited<ReturnType<typeof createApp>>["server"];
let base: string, token: string, otherToken: string;
let userId: number;
let refreshes = 0,
  exchanges = 0;
let failure: "none" | "rate" | "revoked" | "malformed" = "none";
let revokeSuccess = true;
let empty = false;
let lastVerifier: string | null = null;
const today = new Date().toISOString().slice(0, 10);
const measured = new Date(Date.now() - 1000).toISOString();
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
const fakeFetch: typeof fetch = async (input, options) => {
  const url = new URL(String(input));
  assert.ok(["api.prod.whoop.com", "api.ouraring.com"].includes(url.hostname));
  if (url.pathname.endsWith("/token")) {
    const params = new URLSearchParams(String(options?.body));
    if (params.get("grant_type") === "refresh_token") {
      refreshes++;
      if (failure === "revoked") return json({ error: "invalid_grant" }, 400);
      assert.equal(params.get("refresh_token"), "refresh-old");
      return json({
        access_token: "access-new",
        refresh_token: "refresh-new",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    exchanges++;
    lastVerifier = params.get("code_verifier");
    return json({
      access_token: "access-old",
      refresh_token: "refresh-old",
      token_type: "Bearer",
      expires_in: 3600,
    });
  }
  if (url.pathname.endsWith("/user/access") || url.pathname.endsWith("/revoke"))
    return new Response(null, { status: revokeSuccess ? 204 : 503 });
  if (url.pathname.endsWith("/profile/basic"))
    return json({ user_id: 771, email: "not-persisted@example.com" });
  if (url.pathname.endsWith("/personal_info"))
    return json({ id: "oura-fixture" });
  if (failure === "rate")
    return json({ error: "limited" }, 429, { "retry-after": "120" });
  if (failure === "malformed") return json({ unexpected: [] });
  if (url.pathname.endsWith("/recovery"))
    return json({
      records: empty
        ? []
        : [
            {
              sleep_id: "sleep-1",
              score_state: "SCORED",
              score: {
                user_calibrating: false,
                recovery_score: 81,
                hrv_rmssd_milli: 57,
              },
            },
          ],
      next_token: null,
    });
  if (url.pathname.endsWith("/activity/sleep"))
    return json({
      records: empty
        ? []
        : [
            {
              id: "sleep-1",
              end: measured,
              nap: false,
              score_state: "SCORED",
              score: {
                stage_summary: {
                  total_light_sleep_time_milli: 18000000,
                  total_slow_wave_sleep_time_milli: 3600000,
                  total_rem_sleep_time_milli: 7200000,
                },
              },
            },
          ],
      next_token: null,
    });
  if (url.pathname.endsWith("/daily_readiness"))
    return json({
      data: [{ id: "readiness-1", day: today, score: 63, timestamp: measured }],
      next_token: null,
    });
  if (url.pathname.endsWith("/sleep"))
    return json({
      data: [
        {
          day: today,
          type: "long_sleep",
          bedtime_end: measured,
          total_sleep_duration: 25200,
          average_hrv: 54,
        },
      ],
      next_token: null,
    });
  assert.fail(`Unexpected provider route ${url.pathname}`);
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  auth = token,
) {
  return fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "X-Strive-Request": "1",
      "Content-Type": "application/json",
      "X-Strive-Client": "native",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
}
async function begin(provider = "whoop") {
  const response = await call(`/api/connections/${provider}/authorize`, "POST");
  assert.equal(response.status, 200);
  return response.json() as Promise<{
    attemptId: string;
    claimToken: string;
    authorizationUrl: string;
  }>;
}
async function callback(
  attempt: Awaited<ReturnType<typeof begin>>,
  provider = "whoop",
  denied = false,
) {
  const url = new URL(attempt.authorizationUrl);
  return fetch(
    `${base}/api/integrations/${provider}/callback?${new URLSearchParams({ state: url.searchParams.get("state")!, ...(denied ? { error: "access_denied" } : { code: "fixture-code" }) })}`,
    { redirect: "manual" },
  );
}
async function complete(
  attempt: Awaited<ReturnType<typeof begin>>,
  provider = "whoop",
  auth = token,
) {
  return call(
    `/api/connections/${provider}/complete`,
    "POST",
    { attemptId: attempt.attemptId, claimToken: attempt.claimToken },
    auth,
  );
}
const own = (provider = "whoop") =>
  and(eq(connections.userId, userId), eq(connections.provider, provider));
before(async () => {
  await migrateDatabase();
  ({ server } = await createApp({ wearableFetch: fakeFetch }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const register = async (email: string) => {
    const response = await call(
      "/api/auth/signup",
      "POST",
      {
        email,
        password: "fixture-password-123",
        displayName: "Wearable tester",
        timezone: "UTC",
      },
      "",
    );
    assert.equal(response.status, 201);
    return response.json();
  };
  const user = await register("wearable-one@example.com");
  token = user.token;
  userId = user.user.id;
  otherToken = (await register("wearable-two@example.com")).token;
});
after(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await closeDatabase();
});

test("credential encryption detects tampering and cross-account substitution", () => {
  const ciphertext = seal("sensitive-value", "user-one:whoop");
  assert.ok(!ciphertext.includes("sensitive-value"));
  assert.equal(unseal(ciphertext, "user-one:whoop"), "sensitive-value");
  assert.throws(() => unseal(ciphertext, "user-two:whoop"));
  const pieces = ciphertext.split(".");
  const bytes = Buffer.from(pieces[3], "base64url");
  bytes[0] ^= 1;
  pieces[3] = bytes.toString("base64url");
  assert.throws(() => unseal(pieces.join("."), "user-one:whoop"));
});

test("OAuth is state-bound, one-time, account-bound and never exposes provider credentials", async () => {
  const attempt = await begin();
  assert.ok(!attempt.authorizationUrl.includes("fixture-whoop-secret"));
  const wrong = await fetch(
    base +
      "/api/integrations/whoop/callback?state=" +
      "0".repeat(64) +
      "&code=x",
    { redirect: "manual" },
  );
  assert.equal(wrong.status, 400);
  const response = await callback(attempt);
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    `strivefitness://connections?attempt=${attempt.attemptId}&status=ready`,
  );
  assert.equal(
    exchanges,
    0,
    "Browser callback alone cannot mint provider credentials",
  );
  assert.equal((await callback(attempt)).status, 400);
  assert.equal((await complete(attempt, "whoop", otherToken)).status, 400);
  assert.equal(
    (
      await call("/api/connections/whoop/complete", "POST", {
        attemptId: attempt.attemptId,
        claimToken: "f".repeat(64),
      })
    ).status,
    400,
  );
  assert.equal((await complete(attempt)).status, 200);
  assert.equal((await complete(attempt)).status, 400);
  assert.equal(exchanges, 1);
  const [row] = await db.select().from(connections).where(own());
  assert.ok(row.credentials && !row.credentials.includes("access-old"));
  const status = await (await call("/api/connections")).text();
  assert.ok(
    !status.includes("access-old") &&
      !status.includes("refresh-old") &&
      !status.includes(row.credentials!),
  );
  assert.equal(
    (
      await (
        await call("/api/connections", "GET", undefined, otherToken)
      ).json()
    ).whoop.connected,
    false,
  );
});

test("serialized workers persist refresh rotation before downloads and retain readings after failed sync", async () => {
  await db
    .update(connections)
    .set({ expiresAt: new Date(0) })
    .where(own());
  failure = "rate";
  await Promise.all([syncWearables(fakeFetch), syncWearables(fakeFetch)]);
  assert.equal(refreshes, 1);
  const [row] = await db.select().from(connections).where(own());
  assert.equal(
    JSON.parse(unseal(row.credentials!, `wearable:${userId}:whoop`))
      .refresh_token,
    "refresh-new",
  );
  assert.equal(row.lastSyncAt, null);
  failure = "none";
  await db
    .update(connections)
    .set({ nextSyncAt: new Date(0) })
    .where(own());
  await syncWearables(fakeFetch);
  let readings = await db.select().from(days).where(eq(days.userId, userId));
  assert.equal(readings.length, 1);
  assert.equal(readings[0].score, 81);
  assert.equal(readings[0].sleepMinutes, 480);
  failure = "rate";
  await db
    .update(connections)
    .set({ nextSyncAt: new Date(0) })
    .where(own());
  await syncWearables(fakeFetch);
  const [limited] = await db.select().from(connections).where(own());
  assert.equal(limited.lastError, "rate_limited");
  assert.ok(limited.nextSyncAt!.getTime() >= Date.now() + 115000);
  assert.equal((await call("/api/connections/whoop/sync", "POST")).status, 429);
  readings = await db.select().from(days).where(eq(days.userId, userId));
  assert.equal(readings.length, 1);
  assert.equal(refreshes, 1);
  failure = "malformed";
  await db
    .update(connections)
    .set({ nextSyncAt: new Date(0) })
    .where(own());
  await syncWearables(fakeFetch);
  assert.equal(
    (await db.select().from(days).where(eq(days.userId, userId))).length,
    1,
  );
  failure = "none";
});

test("Oura uses PKCE, syncs independent scores and influences guidance conservatively", async () => {
  const attempt = await begin("oura");
  const url = new URL(attempt.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal((await callback(attempt, "oura")).status, 303);
  assert.equal((await complete(attempt, "oura")).status, 200);
  assert.ok(lastVerifier);
  assert.equal(
    createHash("sha256").update(lastVerifier!).digest("base64url"),
    url.searchParams.get("code_challenge"),
  );
  await db
    .update(connections)
    .set({ nextSyncAt: new Date(0) })
    .where(eq(connections.userId, userId));
  await syncWearables(fakeFetch);
  const readings = await db.select().from(days).where(eq(days.userId, userId));
  assert.equal(readings.length, 2);
  assert.equal(readings.find((r) => r.provider === "oura")!.sleepMinutes, 420);
  const guidance = await (await call("/api/readiness")).json();
  assert.equal(guidance.mode, "ease");
  assert.equal(guidance.sources.length, 2);
  assert.equal(
    (await (await call("/api/readiness", "GET", undefined, otherToken)).json())
      .sources.length,
    0,
  );
});

test("lighter training snapshots fewer sets, preserves template, and rejects stale guidance", async () => {
  const [exercise] = await db
    .insert(exercises)
    .values({
      name: "Fixture squat",
      category: "strength",
      muscleGroup: "Legs",
      description: "Fixture",
      measurementType: "weight_reps",
    })
    .returning();
  const created = await call("/api/training/templates", "POST", {
    requestKey: randomUUID(),
    name: "Recovery test",
    duration: 30,
    scheduledDay: null,
    exercises: [
      {
        exerciseId: exercise.id,
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        restSeconds: 90,
      },
    ],
  });
  assert.equal(created.status, 201);
  const template = await created.json();
  const response = await call(
    `/api/training/templates/${template.id}/start`,
    "POST",
    { lighter: true },
  );
  assert.equal(response.status, 201);
  const session = await response.json();
  assert.equal(session.planSnapshot.exercises[0].sets, 3);
  assert.equal(session.planSnapshot.guidance.mode, "ease");
  assert.equal(
    (
      await db
        .select()
        .from(workoutTemplates)
        .where(eq(workoutTemplates.id, template.id))
    )[0].name,
    "Recovery test",
  );
  await call(`/api/training/sessions/${session.id}/finish`, "POST");
  await call("/api/check-in", "POST", {
    energy: "low",
    soreness: "high",
    limited: true,
  });
  assert.equal((await (await call("/api/readiness")).json()).mode, "recover");
  assert.equal(
    (
      await call(`/api/training/templates/${template.id}/start`, "POST", {
        lighter: true,
      })
    ).status,
    409,
  );
});

test("cancelled and expired sign-ins do not connect; repeated cursors fail closed", async () => {
  const attempt = await begin();
  assert.ok(
    (await callback(attempt, "whoop", true)).headers
      .get("location")!
      .endsWith("status=denied"),
  );
  assert.equal((await complete(attempt)).status, 400);
  const expired = await begin();
  await db
    .update(attempts)
    .set({ expiresAt: new Date(0) })
    .where(eq(attempts.id, expired.attemptId));
  assert.equal((await callback(expired)).status, 400);
  const paginated = providerClient(async () =>
    json({ records: [], next_token: "repeated" }),
  );
  await assert.rejects(
    () => paginated.days("whoop", "fixture", today, today, "UTC"),
    (error) =>
      error instanceof ProviderError && error.kind === "invalid_response",
  );
});

test("complete reconciliation removes deleted provider readings without removing other providers", async () => {
  empty = true;
  await db
    .update(connections)
    .set({ nextSyncAt: new Date(0) })
    .where(own());
  await syncWearables(fakeFetch);
  const readings = await db.select().from(days).where(eq(days.userId, userId));
  assert.equal(readings.length, 1);
  assert.equal(readings[0].provider, "oura");
  empty = false;
  await db
    .update(connections)
    .set({ nextSyncAt: new Date(0) })
    .where(own());
  await syncWearables(fakeFetch);
});

test("invalid refresh stops retries; disconnect deletes tokens and readings even if revocation is unavailable", async () => {
  failure = "revoked";
  await db
    .update(connections)
    .set({ expiresAt: new Date(0), nextSyncAt: new Date(0) })
    .where(own());
  await syncWearables(fakeFetch);
  const [row] = await db.select().from(connections).where(own());
  assert.equal(row.status, "reconnect_required");
  assert.equal(row.nextSyncAt, null);
  revokeSuccess = false;
  const result = await call("/api/connections/whoop", "DELETE");
  assert.equal(result.status, 200);
  assert.equal((await result.json()).revoked, false);
  assert.equal((await db.select().from(connections).where(own())).length, 0);
  assert.equal(
    (
      await db
        .select()
        .from(days)
        .where(and(eq(days.userId, userId), eq(days.provider, "whoop")))
    ).length,
    0,
  );
  assert.equal(
    (await db.select().from(days).where(eq(days.userId, userId))).length,
    1,
    "Other provider remains connected",
  );
  failure = "none";
});

test("WHOOP assigns the sleep-end local day and excludes naps", async () => {
  const client = providerClient(async (input) => {
    if (String(input).includes("/recovery?"))
      return json({
        records: [
          {
            sleep_id: "night",
            score_state: "SCORED",
            score: {
              user_calibrating: false,
              recovery_score: 75,
              hrv_rmssd_milli: 45,
            },
          },
          {
            sleep_id: "nap",
            score_state: "SCORED",
            score: {
              user_calibrating: false,
              recovery_score: 99,
              hrv_rmssd_milli: 45,
            },
          },
        ],
      });
    return json({
      records: [
        {
          id: "night",
          end: "2026-09-29T01:30:00Z",
          nap: false,
          score_state: "SCORED",
          score: null,
        },
        {
          id: "nap",
          end: "2026-09-29T04:30:00Z",
          nap: true,
          score_state: "SCORED",
          score: null,
        },
      ],
    });
  });
  const readings = await client.days(
    "whoop",
    "fixture",
    "2026-09-27",
    "2026-09-30",
    "America/Los_Angeles",
  );
  assert.equal(readings.length, 1);
  assert.equal(readings[0].day, "2026-09-28");
  assert.equal(readings[0].score, 75);
  assert.equal(readings[0].sleepMinutes, null);
});

test("readiness blocks escalation for stale data, calibration, missing history/check-in and limiting symptoms", () => {
  const now = new Date();
  const baseReading = {
    id: 1,
    userId,
    provider: "whoop",
    day: today,
    sourceId: "fixture",
    score: 90,
    sleepMinutes: 480,
    hrv: 57,
    calibrating: false,
    observedAt: now,
  };
  const connection = {
    provider: "whoop",
    status: "connected",
    lastSyncAt: now,
    lastError: null,
  };
  const checkin = { limited: false, energy: "usual", soreness: "none" };
  const history = Array.from({ length: 8 }, (_, i) => ({
    ...baseReading,
    day: new Date(now.getTime() - (i + 1) * 86400_000)
      .toISOString()
      .slice(0, 10),
  }));
  const readings = [baseReading, ...history];
  assert.equal(
    assessReadiness(today, readings, [connection], checkin, now).mode,
    "progress",
  );
  assert.equal(
    assessReadiness(today, readings, [connection], null, now).mode,
    "steady",
  );
  assert.equal(
    assessReadiness(today, [baseReading], [connection], checkin, now).mode,
    "steady",
  );
  assert.equal(
    assessReadiness(
      today,
      readings,
      [{ ...connection, lastSyncAt: new Date(0) }],
      checkin,
      now,
    ).mode,
    "unknown",
  );
  assert.equal(
    assessReadiness(
      today,
      [{ ...baseReading, calibrating: true }],
      [connection],
      checkin,
      now,
    ).mode,
    "unknown",
  );
  assert.equal(
    assessReadiness(
      today,
      readings,
      [connection],
      { ...checkin, limited: true },
      now,
    ).mode,
    "recover",
  );
  assert.equal(
    assessReadiness(
      today,
      readings,
      [connection],
      { ...checkin, energy: "low" },
      now,
    ).mode,
    "ease",
  );
});
