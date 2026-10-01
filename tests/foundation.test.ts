import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Never use a developer's or a production database in this suite.
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";
await mkdir(".test-data", { recursive: true });
const databasePath = await mkdtemp(resolve(".test-data", "foundation-"));
process.env.LOCAL_DATABASE_PATH = databasePath;
const { migrateDatabase, closeDatabase, db } = await import("../server/db");
const { createApp } = await import("../server/app");
const { seedCatalogue } = await import("../server/seed");
const { hashPassword, verifyPassword } = await import("../server/passwords");
const { users, sessions } = await import("../shared/schema");
const { eq } = await import("drizzle-orm");
let server: Awaited<ReturnType<typeof createApp>>["server"];
let base: string;
let alice: string;
let bob: string;
let aliceId: number;
let templateId: number;
let workoutId: number;
let setId: number;
let mealId: number;
let medicationId: number;
let scheduleId: number;
let exerciseId: number;

async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = alice,
  csrf = true,
) {
  return fetch(base + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-Strive-Request": "1" } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function create(path: string, body: unknown, cookie = alice) {
  const response = await call(path, "POST", body, cookie);
  const data = await response.json();
  assert.equal(response.status, 201, JSON.stringify(data));
  return data;
}
before(async () => {
  await migrateDatabase();
  await migrateDatabase();
  await seedCatalogue();
  ({ server } = await createApp());
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
  await closeDatabase();
  const reopened = new PGlite(databasePath);
  const result = await reopened.query<{ count: number }>(
    "select count(*)::int as count from meals",
  );
  assert.ok(
    result.rows[0].count >= 1,
    "Meals survive closing and reopening the database",
  );
  await reopened.close();
});

test("passwords are salted and verified; plaintext is not accepted", async () => {
  const first = await hashPassword("a-long-test-password");
  assert.notEqual(first, await hashPassword("a-long-test-password"));
  assert.equal(await verifyPassword("a-long-test-password", first), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
  assert.equal(await verifyPassword("password123", "password123"), false);
});
test("native sessions use bearer tokens, isolate records and revoke on logout", async () => {
  const headers = {
    "Content-Type": "application/json",
    "X-Strive-Request": "1",
    "X-Strive-Client": "native",
  };
  const signup = await fetch(base + "/api/auth/signup", {
    method: "POST",
    headers,
    body: JSON.stringify({
      email: "native@example.test",
      password: "native-test-password",
      displayName: "Native Test",
      timezone: "Europe/London",
    }),
  });
  assert.equal(signup.status, 201);
  assert.equal(signup.headers.get("set-cookie"), null);
  const session = await signup.json();
  assert.match(session.token, /^[a-f0-9]{64}$/);
  assert.equal(session.user.password, undefined);
  const auth = { ...headers, Authorization: `Bearer ${session.token}` };
  const me = await fetch(base + "/api/auth/me", { headers: auth });
  assert.equal((await me.json()).id, session.user.id);
  const checkin = await fetch(base + "/api/check-in", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ energy: "high", soreness: "none", limited: false }),
  });
  assert.equal(checkin.status, 200);
  const meal = await fetch(base + "/api/meals", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      name: "Native meal",
      timestamp: new Date().toISOString(),
      calories: 250,
      protein: 20,
      carbs: 30,
      fat: 5,
      foods: [{ name: "Native meal", quantity: 1, unit: "serving" }],
    }),
  });
  assert.equal(meal.status, 201);
  assert.equal((await meal.json()).userId, session.user.id);
  const other = await fetch(base + `/api/users/${session.user.id + 1}/meals`, {
    headers: auth,
  });
  assert.equal(other.status, 404);
  await fetch(base + "/api/auth/signout", { method: "POST", headers: auth });
  assert.equal(
    (await fetch(base + "/api/auth/me", { headers: auth })).status,
    401,
  );
});
test("unauthenticated and cross-origin form writes are rejected", async () => {
  assert.equal((await call("/api/user/1", "GET", undefined, "")).status, 401);
  assert.equal(
    (
      await call(
        "/api/auth/signup",
        "POST",
        { email: "test@example.com" },
        "",
        false,
      )
    ).status,
    403,
  );
});
test("signup normalises email, hashes password and issues an HTTP-only session", async () => {
  const response = await call(
    "/api/auth/signup",
    "POST",
    {
      email: "Alice@Example.com",
      password: "test-password-123",
      displayName: "Alice",
      timezone: "Europe/London",
    },
    "",
  );
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  alice = cookie.split(";")[0];
  const account = await response.json();
  aliceId = account.id;
  assert.equal(account.username, "alice@example.com");
  assert.equal(account.password, undefined);
  const [stored] = await db.select().from(users).where(eq(users.id, aliceId));
  assert.match(stored.password, /^scrypt:/);
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, aliceId));
  assert.notEqual(session.tokenHash, alice.split("=")[1]);
  assert.equal((await call("/api/auth/me")).status, 200);
  const second = await call(
    "/api/auth/signup",
    "POST",
    {
      email: "bob@example.com",
      password: "test-password-456",
      displayName: "Bob",
    },
    "",
  );
  bob = second.headers.get("set-cookie")!.split(";")[0];
  assert.equal(second.status, 201);
  assert.equal(
    (
      await call(
        "/api/auth/signin",
        "POST",
        { email: "alice@example.com", password: "incorrect-password" },
        "",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/auth/signup",
        "POST",
        {
          email: "ALICE@example.com",
          password: "another-password",
          displayName: "Duplicate",
        },
        "",
      )
    ).status,
    409,
  );
});
test("profile ownership and protected fields cannot be bypassed", async () => {
  assert.equal(
    (await call(`/api/user/${aliceId}`, "GET", undefined, bob)).status,
    404,
  );
  assert.equal(
    (
      await call("/api/user/me", "PATCH", {
        password: "replacement",
        subscriptionPlan: "advanced",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/user/me", "PATCH", { timezone: "not/a-zone" })).status,
    400,
  );
  assert.equal(
    (await call("/api/user/me", "PATCH", { displayName: "Alice Updated" }))
      .status,
    200,
  );
});
test("workout and child ownership survives malicious foreign IDs and reparenting", async () => {
  const exercises = await (await call("/api/exercises")).json();
  exerciseId = exercises[0].id;
  const template = await create("/api/workout-templates", {
    name: "Own workout",
    exerciseCount: 1,
    duration: 30,
    userId: 999,
  });
  templateId = template.id;
  assert.equal(template.userId, aliceId);
  assert.equal(
    (await call(`/api/workout-templates/${templateId}`, "GET", undefined, bob))
      .status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/workout-templates/${templateId}`,
        "PATCH",
        { name: "Hijacked" },
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        "/api/completed-workouts",
        "POST",
        { workoutTemplateId: templateId, startTime: new Date().toISOString() },
        bob,
      )
    ).status,
    404,
  );
  workoutId = (
    await create("/api/completed-workouts", {
      workoutTemplateId: templateId,
      startTime: new Date().toISOString(),
    })
  ).id;
  setId = (
    await create("/api/workout-sets", {
      completedWorkoutId: workoutId,
      exerciseId,
      setNumber: 1,
      reps: 10,
      weight: 20,
      timestamp: new Date().toISOString(),
    })
  ).id;
  assert.equal(
    (await call(`/api/workout-sets/${setId}`, "PATCH", { reps: 50 }, bob))
      .status,
    404,
  );
  assert.equal(
    (
      await call(`/api/workout-sets/${setId}`, "PATCH", {
        completedWorkoutId: 999,
      })
    ).status,
    400,
  );
  assert.deepEqual(
    await (
      await call(`/api/exercises/${exerciseId}/sets`, "GET", undefined, bob)
    ).json(),
    [],
  );
  assert.equal(
    (
      await call(
        `/api/workout-templates/${templateId}`,
        "DELETE",
        undefined,
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (await call(`/api/workout-templates/${templateId}`, "DELETE")).status,
    409,
    "Referenced workout history is preserved",
  );
});
test("meal totals follow the local date and recompute after historical edits", async () => {
  const meal = await create("/api/meals", {
    name: "Midnight meal",
    timestamp: "2026-09-28T23:30:00Z",
    calories: 500,
    protein: 30,
    carbs: 55,
    fat: 15,
    foods: ["Test food"],
  });
  mealId = meal.id;
  let stats = await (
    await call("/api/users/me/daily-stats?date=2026-09-29")
  ).json();
  assert.equal(stats.caloriesConsumed, 500);
  assert.equal(
    (await (await call("/api/users/me/daily-stats?date=2026-09-28")).json())
      .caloriesConsumed,
    0,
  );
  assert.equal(
    (
      await call(`/api/meals/${mealId}`, "PATCH", {
        calories: 700,
        timestamp: "2026-09-27T12:00:00Z",
      })
    ).status,
    200,
  );
  stats = await (
    await call("/api/users/me/daily-stats?date=2026-09-29")
  ).json();
  assert.equal(stats.caloriesConsumed, 0);
  stats = await (
    await call("/api/users/me/daily-stats?date=2026-09-27")
  ).json();
  assert.equal(stats.caloriesConsumed, 700);
  assert.equal(
    (await call(`/api/meals/${mealId}`, "DELETE", undefined, bob)).status,
    404,
  );
  assert.equal(
    (
      await call("/api/meals", "POST", {
        name: "Invalid",
        timestamp: "not-a-date",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/users/me/daily-stats?date=2026-02-30")).status,
    400,
  );
  const sameDay = await Promise.all(
    Array.from({ length: 4 }, () =>
      call("/api/users/me/daily-stats?date=2026-09-27").then((r) => r.json()),
    ),
  );
  assert.equal(new Set(sameDay.map((s) => s.id)).size, 1);
});
test("medication schedules cannot cross account boundaries", async () => {
  medicationId = (
    await create("/api/medications", {
      name: "User-entered supplement",
      type: "tablet",
      dosage: "As entered",
      frequency: "Daily",
      startDate: "2026-09-29T00:00:00Z",
    })
  ).id;
  assert.equal(
    (
      await call(
        "/api/medication-schedules",
        "POST",
        { medicationId, scheduledTime: "2026-09-29T20:00:00Z" },
        bob,
      )
    ).status,
    404,
  );
  scheduleId = (
    await create("/api/medication-schedules", {
      medicationId,
      scheduledTime: "2026-09-29T20:00:00Z",
    })
  ).id;
  assert.equal(
    (
      await call(
        `/api/medication-schedules/${scheduleId}`,
        "PATCH",
        { isTaken: true },
        bob,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/api/medication-schedules/${scheduleId}`, "PATCH", {
        medicationId: 999,
      })
    ).status,
    400,
  );
  assert.deepEqual(
    await (
      await call("/api/users/me/medication-schedules", "GET", undefined, bob)
    ).json(),
    [],
  );
});
test("check-ins are per-account and connections never simulate success", async () => {
  const first = await (
    await call("/api/check-in", "POST", {
      energy: "low",
      soreness: "some",
      limited: false,
    })
  ).json();
  const second = await (
    await call("/api/check-in", "POST", {
      energy: "usual",
      soreness: "none",
      limited: false,
    })
  ).json();
  assert.equal(first.id, second.id);
  assert.equal(
    await (await call("/api/check-in", "GET", undefined, bob)).json(),
    null,
  );
  const connections = await (await call("/api/connections")).json();
  assert.equal(connections.whoop.connected, false);
  assert.equal(
    (
      await call("/api/health-integrations/connect", "POST", {
        platform: "whoop",
      })
    ).status,
    501,
  );
  assert.equal(
    (await call("/api/users/me/health-integrations/sync?platform=whoop"))
      .status,
    409,
  );
});
test("native training saves atomically, resumes, snapshots and locks finished sessions", async () => {
  const input = {
    requestKey: randomUUID(),
    name: "Native strength",
    duration: 40,
    scheduledDay: "Monday",
    exercises: [
      { exerciseId, sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 },
    ],
  };
  const before = await (await call("/api/users/me/workout-templates")).json();
  assert.equal(
    (
      await call("/api/training/templates", "POST", {
        ...input,
        requestKey: randomUUID(),
        exercises: [{ ...input.exercises[0], exerciseId: 2147483647 }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await (await call("/api/users/me/workout-templates")).json()).length,
    before.length,
  );
  assert.equal(
    (
      await call("/api/training/templates", "POST", {
        ...input,
        exercises: [{ ...input.exercises[0], repsMin: 20 }],
      })
    ).status,
    400,
  );
  const responses = await Promise.all([
    call("/api/training/templates", "POST", input),
    call("/api/training/templates", "POST", input),
  ]);
  assert.ok(responses.every((response) => response.status === 201));
  const [first, second] = await Promise.all(
    responses.map((response) => response.json()),
  );
  assert.equal(first.id, second.id);
  assert.equal(
    (await (await call(`/api/workout-templates/${first.id}/exercises`)).json())
      .length,
    1,
  );
  assert.equal(
    (
      await call("/api/training/templates", "POST", {
        ...input,
        name: "Different retry",
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`/api/training/templates/${first.id}/start`, "POST", {}, bob))
      .status,
    404,
  );
  const sessions = await Promise.all([
    call(`/api/training/templates/${first.id}/start`, "POST"),
    call(`/api/training/templates/${first.id}/start`, "POST"),
  ]);
  const [started, resumed] = await Promise.all(
    sessions.map((response) => response.json()),
  );
  assert.equal(started.id, resumed.id);
  assert.equal(started.planSnapshot.name, "Native strength");
  await call(`/api/workout-templates/${first.id}`, "PATCH", {
    name: "Changed later",
  });
  const detail = await (
    await call(`/api/training/sessions/${started.id}`)
  ).json();
  assert.equal(detail.workout.planSnapshot.name, "Native strength");
  assert.equal(
    (await call(`/api/training/sessions/${started.id}`, "GET", undefined, bob))
      .status,
    404,
  );
  const set = { exerciseId, setNumber: 1, weight: 0, reps: 10, rpe: 7 };
  assert.equal(
    (
      await call(`/api/training/sessions/${started.id}/sets`, "PUT", {
        ...set,
        weight: -1,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/api/training/sessions/${started.id}/sets`, "PUT", {
        ...set,
        setNumber: 4,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(`/api/training/sessions/${started.id}/sets`, "PUT", set, bob))
      .status,
    404,
  );
  const sets = await Promise.all([
    call(`/api/training/sessions/${started.id}/sets`, "PUT", set),
    call(`/api/training/sessions/${started.id}/sets`, "PUT", set),
  ]);
  const [saved, retried] = await Promise.all(
    sets.map((response) => response.json()),
  );
  assert.equal(saved.id, retried.id);
  assert.equal(
    (
      await call("/api/workout-sets", "POST", {
        ...set,
        completedWorkoutId: started.id,
        timestamp: new Date().toISOString(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/completed-workouts/${started.id}`, "PATCH", {
        isCompleted: true,
      })
    ).status,
    409,
  );
  const finish = await (
    await call(`/api/training/sessions/${started.id}/finish`, "POST")
  ).json();
  assert.equal(finish.isCompleted, true);
  assert.ok(finish.endTime);
  assert.equal(
    (
      await (
        await call(`/api/training/sessions/${started.id}/finish`, "POST")
      ).json()
    ).endTime,
    finish.endTime,
  );
  assert.equal(
    (
      await call(`/api/training/sessions/${started.id}/sets`, "PUT", {
        ...set,
        reps: 12,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`/api/workout-sets/${saved.id}`, "PATCH", { reps: 12 })).status,
    409,
  );
  assert.equal(
    (await call(`/api/workout-sets/${saved.id}`, "DELETE")).status,
    409,
  );
  const final = await (
    await call(`/api/training/sessions/${started.id}`)
  ).json();
  assert.equal(final.sets.length, 1);
  assert.equal(final.sets[0].weight, 0);
});
test("routine records preserve doses, reject cross-account access and deduplicate retries", async () => {
  const routine = await create("/api/medications", {
    name: "Daily supplement",
    category: "supplement",
    type: "capsule",
    dosage: "1 capsule",
    frequency: "Once daily",
    startDate: new Date().toISOString(),
    isActive: true,
  });
  const input = {
    medicationId: routine.id,
    status: "taken",
    requestKey: randomUUID(),
  };
  assert.equal(
    (await call("/api/routine-logs", "POST", input, bob)).status,
    404,
  );
  const attempts = await Promise.all([
    call("/api/routine-logs", "POST", input),
    call("/api/routine-logs", "POST", input),
  ]);
  const [first, second] = await Promise.all(
    attempts.map((response) => response.json()),
  );
  assert.equal(first.id, second.id);
  assert.equal(
    (await call("/api/routine-logs", "POST", { ...input, status: "skipped" }))
      .status,
    409,
  );
  await call(`/api/medications/${routine.id}`, "PATCH", {
    dosage: "2 capsules",
    isActive: false,
  });
  const logs = await (await call("/api/routine-logs")).json();
  assert.equal(
    logs.find((item: any) => item.id === first.id).dosage,
    "1 capsule",
  );
  assert.equal(
    (
      await call("/api/routine-logs", "POST", {
        ...input,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`/api/medications/${routine.id}`, "DELETE")).status,
    409,
  );
  assert.deepEqual(
    await (await call("/api/routine-logs", "GET", undefined, bob)).json(),
    [],
  );
  assert.equal(
    (
      await call(`/api/medications/${routine.id}`, "PATCH", {
        category: "unknown",
      })
    ).status,
    400,
  );
});
test("records exclude unfinished sessions, isolate accounts, compare saved corrections and do not award ties", async () => {
  const catalogue = await (await call("/api/exercises")).json();
  const id = catalogue.find((e: any) => e.name === "Goblet Squat").id;
  const template = await create("/api/training/templates", {
    requestKey: randomUUID(), name: "Record checks", duration: 30, scheduledDay: null,
    exercises: [{exerciseId:id, sets:2, repsMin:8, repsMax:10, restSeconds:90}],
  });
  async function start() { return create(`/api/training/templates/${template.id}/start`, {}); }
  async function log(session: any, weight: number, reps: number) {
    const response = await call(`/api/training/sessions/${session.id}/sets`, "PUT", {exerciseId:id,setNumber:1,weight,reps,rpe:7});
    assert.equal(response.status,200);
  }
  async function record() { return (await (await call("/api/training/records")).json()).find((r: any) => r.exerciseId === id); }
  async function detail(session: any) { return (await call(`/api/training/sessions/${session.id}`)).json(); }
  const first = await start();
  await log(first,20,8);
  assert.equal(await record(),undefined);
  await call(`/api/training/sessions/${first.id}/finish`,"POST",{});
  assert.equal((await record()).heaviest,20);
  assert.deepEqual((await detail(first)).achievements[0].achievements,["First session · baseline established"]);
  assert.equal((await (await call("/api/training/records","GET",undefined,bob)).json()).some((r: any) => r.exerciseId === id),false);
  assert.equal((await call(`/api/training/sessions/${first.id}`,"GET",undefined,bob)).status,404);
  const second = await start();
  await log(second,25,8);
  await log(second,20,8);
  assert.equal((await detail(second)).sets.length,1);
  assert.deepEqual((await detail(second)).achievements[0].achievements,[]);
  assert.equal((await detail(second)).performance.find((r: any) => r.exerciseId === id).previous[0].weight,20);
  await log(second,22,10);
  assert.equal((await record()).heaviest,20);
  await call(`/api/training/sessions/${second.id}/finish`,"POST",{});
  await call(`/api/training/sessions/${second.id}/finish`,"POST",{});
  assert.equal((await record()).sessionCount,2);
  assert.equal((await record()).heaviest,22);
  assert.equal((await record()).bestSetVolume,220);
  assert.equal((await detail(second)).achievements[0].achievements.length,2);
  assert.deepEqual((await detail(first)).achievements[0].achievements,["First session · baseline established"]);
  const third = await start();
  await log(third,22,10);
  await call(`/api/training/sessions/${third.id}/finish`,"POST",{});
  assert.deepEqual((await detail(third)).achievements[0].achievements,[]);
});
test("serving journal calculates portions, deduplicates retries and isolates edits", async () => {
  const food = {name:"Fixture yoghurt",mealType:"breakfast",basis:"100g",amount:175,nutrients:{calories:100,protein:10,carbs:6,fat:4},timestamp:"2026-09-29T23:30:00Z"};
  const body = {requestKey:randomUUID(),food};
  const responses = await Promise.all([call("/api/nutrition/entries","POST",body),call("/api/nutrition/entries","POST",body)]);
  assert.ok(responses.every(r=>r.status===201));
  const [first,second] = await Promise.all(responses.map(r=>r.json()));
  assert.equal(first.id,second.id);
  assert.equal(first.calories,175);
  assert.equal(first.protein,17.5);
  assert.equal(first.carbs,10.5);
  assert.equal(first.fat,7);
  assert.equal((await call("/api/nutrition/entries","POST",{...body,food:{...food,amount:200}})).status,409);
  assert.equal((await call(`/api/nutrition/entries/${first.id}`,"PUT",food,bob)).status,404);
  assert.equal((await call("/api/nutrition/entries","POST",{...body,requestKey:randomUUID(),food:{...food,amount:0}})).status,400);
  assert.equal((await call("/api/nutrition/entries","POST",{...body,requestKey:randomUUID(),food:{...food,basis:"serving",amount:10000}})).status,400);
  const updated=await (await call(`/api/nutrition/entries/${first.id}`,"PUT",{...food,amount:200})).json();
  assert.equal(updated.calories,200);
  const replay=await (await call("/api/nutrition/entries","POST",body)).json();
  assert.equal(replay.calories,200,"Creation retry must not undo a later edit");
  assert.equal((await call(`/api/meals/${first.id}`,"PATCH",{creationKey:randomUUID()})).status,400);
});
test("nutrition days respect account timezone, optional targets and invalid dates", async () => {
  const before=await (await call("/api/auth/me")).json();
  await call("/api/user/me","PATCH",{timezone:"Europe/London",dailyCalorieTarget:2300,dailyProteinTarget:150});
  const day=await (await call("/api/nutrition/day?date=2026-09-30")).json();
  assert.equal(day.timezone,"Europe/London");
  assert.equal(day.targets.calories,2300);
  assert.equal(day.targets.protein,150);
  assert.equal(day.entries.find((e:any)=>e.name==="Fixture yoghurt").calories,200);
  const previous=await (await call("/api/nutrition/day?date=2026-09-29")).json();
  assert.equal(previous.entries.some((e:any)=>e.name==="Fixture yoghurt"),false);
  const other=await (await call("/api/nutrition/day?date=2026-09-30","GET",undefined,bob)).json();
  assert.equal(other.entries.some((e:any)=>e.name==="Fixture yoghurt"),false);
  assert.equal((await call("/api/nutrition/day?date=2026-02-30")).status,400);
  await call("/api/user/me","PATCH",{timezone:before.timezone,dailyCalorieTarget:before.dailyCalorieTarget,dailyProteinTarget:before.dailyProteinTarget});
});
test("signout invalidates the server session and subsequent sign-in works", async () => {
  assert.equal((await call("/api/auth/signout", "POST")).status, 204);
  assert.equal((await call("/api/auth/me")).status, 401);
  assert.equal((await call("/api/users/me/meals")).status, 401);
  const response = await call(
    "/api/auth/signin",
    "POST",
    { email: "alice@example.com", password: "test-password-123" },
    "",
  );
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("set-cookie"));
});
