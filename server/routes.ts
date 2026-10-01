import type { Express, Request } from "express";
import { createServer } from "node:http";
import { and, eq, gte, lte, sql, getTableColumns, type SQL } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { db } from "./db";
import * as s from "../shared/schema";
import { asyncHandler, publicUser, registerAuth } from "./auth";
import { searchFoods } from "./nutritionApi";
import { getProductByBarcode } from "./openFoodFactsApi";
import { registerTraining } from "./training";
import { registerRoutines } from "./routines";
import { registerWearableCallbacks, registerWearables } from "./wearables";
import type { ProviderFetch } from "./wearable-providers";
import { registerReadiness } from "./readiness";
import { registerCoach } from "./coach/routes";
import { registerPlanning } from "./planning";
import { registerTemplateEditing } from "./training-templates";
import { registerNutritionJournal } from "./nutrition-journal";
import { registerMail, registerMailCallbacks } from "./mail";
import type { MailFetch } from "./mail-providers";

const id = (value: unknown) =>
  z.coerce.number().int().positive().max(2147483647).parse(value);
function notFound() {
  return Object.assign(new Error("Record not found."), { status: 404 });
}
export function dayKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function selectedDay(req: Request) {
  const value = req.query.date;
  if (value === undefined) return dayKey(new Date(), req.account.timezone);
  const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(value);
  if (
    Number.isNaN(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw Object.assign(new Error("Invalid date."), { status: 400 });
  return day;
}
const calendarDay = (column: any, req: Request) =>
  sql`to_char(timezone(${req.account.timezone}, ${column}), 'YYYY-MM-DD') = ${selectedDay(req)}`;
function range(column: any, req: Request) {
  const conditions: SQL[] = [];
  for (const key of ["startDate", "endDate"] as const)
    if (req.query[key]) {
      const value = z.coerce.date().parse(req.query[key]);
      conditions.push(
        key === "startDate" ? gte(column, value) : lte(column, value),
      );
    }
  return conditions;
}

// The small registry is the API allowlist. Ownership is part of every SQL operation,
// including indirect children, rather than trusting any submitted userId.
type Resource = {
  table: any;
  schema: z.AnyZodObject;
  owned: (userId: number) => SQL;
  direct?: boolean;
  immutable?: string[];
  filters?: (req: Request) => SQL[];
  parent?: { key: string; table: any; owner: (userId: number) => SQL };
};
function resource(app: Express, name: string, r: Resource) {
  const schema = r.schema.omit({ id: true, userId: true });
  const columns = getTableColumns(r.table);
  const parse = (body: unknown, partial: boolean) => {
    const input = { ...z.record(z.unknown()).parse(body) };
    delete input.userId;
    for (const [key, col] of Object.entries(columns))
      if ((col as any).dataType === "date" && input[key] != null)
        input[key] = z.coerce.date().parse(input[key]);
    const validator = partial
      ? schema
          .omit(Object.fromEntries((r.immutable || []).map((k) => [k, true])))
          .partial()
      : schema;
    const data: Record<string, any> = validator.strict().parse(input);
    if (partial && !Object.keys(data).length)
      throw Object.assign(new Error("No editable fields supplied."), {
        status: 400,
      });
    return data;
  };
  if (r.direct)
    app.get(
      `/api/users/:userId/${name}`,
      asyncHandler(async (req, res) => {
        res.json(
          await db
            .select()
            .from(r.table)
            .where(and(r.owned(req.account.id), ...(r.filters?.(req) || []))),
        );
      }),
    );
  app.get(
    `/api/${name}/:id`,
    asyncHandler(async (req, res) => {
      const [record] = await db
        .select()
        .from(r.table)
        .where(and(eq(r.table.id, id(req.params.id)), r.owned(req.account.id)));
      if (!record) throw notFound();
      res.json(record);
    }),
  );
  app.post(
    `/api/${name}`,
    asyncHandler(async (req, res) => {
      const data = parse(req.body, false);
      if (r.parent) {
        const [parent] = await db
          .select({ id: r.parent.table.id })
          .from(r.parent.table)
          .where(
            and(
              eq(r.parent.table.id, id(data[r.parent.key])),
              r.parent.owner(req.account.id),
            ),
          );
        if (!parent) throw notFound();
      }
      const [created] = (await db
        .insert(r.table)
        .values({ ...data, ...(r.direct ? { userId: req.account.id } : {}) })
        .returning()) as Record<string, unknown>[];
      res.status(201).json(created);
    }),
  );
  app.patch(
    `/api/${name}/:id`,
    asyncHandler(async (req, res) => {
      const data = parse(req.body, true);
      const [updated] = await db
        .update(r.table)
        .set(data)
        .where(and(eq(r.table.id, id(req.params.id)), r.owned(req.account.id)))
        .returning();
      if (!updated) throw notFound();
      res.json(updated);
    }),
  );
  app.delete(
    `/api/${name}/:id`,
    asyncHandler(async (req, res) => {
      const removed = await db
        .delete(r.table)
        .where(and(eq(r.table.id, id(req.params.id)), r.owned(req.account.id)))
        .returning({ id: r.table.id });
      if (!removed.length) throw notFound();
      res.sendStatus(204);
    }),
  );
}

export async function registerRoutes(
  app: Express,
  options: { wearableFetch?: ProviderFetch; mailFetch?: MailFetch } = {},
) {
  registerWearableCallbacks(app);
  registerMailCallbacks(app);
  registerAuth(app);
  registerWearables(app, options.wearableFetch);
  registerReadiness(app);
  registerCoach(app);
  registerPlanning(app);
  registerTemplateEditing(app);
  registerTraining(app);
  registerRoutines(app);
  registerNutritionJournal(app);
  registerMail(app, options.mailFetch);
  app.use(["/api/users/:userId", "/api/user/:userId"], (req, res, next) => {
    if (
      req.params.userId !== "me" &&
      req.params.userId !== String(req.account.id)
    )
      return res.status(404).json({ message: "Record not found." });
    next();
  });
  app.get("/api/user/:userId", (req, res) => res.json(publicUser(req.account)));
  const profile = z
    .object({
      displayName: z.string().trim().min(2).max(80),
      height: z.number().positive().max(300).nullable(),
      weight: z.number().positive().max(1000).nullable(),
      bodyFat: z.number().min(0).max(100).nullable(),
      dailyCalorieTarget: z.number().int().positive().max(20000).nullable(),
      dailyProteinTarget: z.number().int().nonnegative().max(1000).nullable(),
      dailyCarbsTarget: z.number().int().nonnegative().max(2000).nullable(),
      dailyFatTarget: z.number().int().nonnegative().max(1000).nullable(),
      dailyStepTarget: z.number().int().nonnegative().max(200000).nullable(),
      timezone: z.string().max(80),
    })
    .partial()
    .strict();
  app.patch(
    "/api/user/:userId",
    asyncHandler(async (req, res) => {
      const data = profile.parse(req.body);
      if (!Object.keys(data).length)
        return res
          .status(400)
          .json({ message: "No editable fields supplied." });
      if (data.timezone) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: data.timezone });
        } catch {
          return res.status(400).json({ message: "Invalid timezone." });
        }
      }
      const [user] = await db
        .update(s.users)
        .set(data)
        .where(eq(s.users.id, req.account.id))
        .returning();
      res.json(publicUser(user));
    }),
  );
  app.get("/api/users/:userId/widgets", (req, res) =>
    res.json(req.account.dashboardWidgets || []),
  );
  app.put(
    "/api/users/:userId/widgets",
    asyncHandler(async (req, res) => {
      const widgets = z.array(z.record(z.unknown())).max(30).parse(req.body);
      await db
        .update(s.users)
        .set({ dashboardWidgets: widgets })
        .where(eq(s.users.id, req.account.id));
      res.json(widgets);
    }),
  );
  app.get(
    "/api/exercises",
    asyncHandler(async (_req, res) =>
      res.json(await db.select().from(s.exercises)),
    ),
  );
  app.get(
    "/api/exercises/:id",
    asyncHandler(async (req, res) => {
      const [exercise] = await db
        .select()
        .from(s.exercises)
        .where(eq(s.exercises.id, id(req.params.id)));
      if (!exercise) throw notFound();
      res.json(exercise);
    }),
  );

  const templateOwner = (uid: number) => eq(s.workoutTemplates.userId, uid);
  const workoutOwner = (uid: number) => eq(s.completedWorkouts.userId, uid);
  const medicationOwner = (uid: number) => eq(s.medications.userId, uid);
  const setOwner = (uid: number) =>
    sql`exists (select 1 from ${s.completedWorkouts} where ${s.completedWorkouts.id} = ${s.workoutSets.completedWorkoutId} and ${s.completedWorkouts.userId} = ${uid})`;
  const scheduleOwner = (uid: number) =>
    sql`exists (select 1 from ${s.medications} where ${s.medications.id} = ${s.medicationSchedule.medicationId} and ${s.medications.userId} = ${uid})`;
  const templateExerciseOwner = (uid: number) =>
    sql`exists (select 1 from ${s.workoutTemplates} where ${s.workoutTemplates.id} = ${s.workoutTemplateExercises.workoutTemplateId} and ${s.workoutTemplates.userId} = ${uid})`;

  resource(app, "workout-templates", {
    table: s.workoutTemplates,
    schema: s.insertWorkoutTemplateSchema.omit({ creationKey: true }).extend({
      name: z.string().trim().min(1).max(160),
      duration: z.number().int().positive().max(1440),
      exerciseCount: z.number().int().nonnegative(),
    }),
    owned: templateOwner,
    direct: true,
  });
  resource(app, "completed-workouts", {
    table: s.completedWorkouts,
    schema: createInsertSchema(s.completedWorkouts).omit({
      id: true,
      planSnapshot: true,
    }),
    owned: workoutOwner,
    direct: true,
    immutable: ["workoutTemplateId"],
    parent: {
      key: "workoutTemplateId",
      table: s.workoutTemplates,
      owner: templateOwner,
    },
  });
  resource(app, "workout-template-exercises", {
    table: s.workoutTemplateExercises,
    schema: s.insertWorkoutTemplateExerciseSchema,
    owned: templateExerciseOwner,
    immutable: ["workoutTemplateId", "exerciseId"],
    parent: {
      key: "workoutTemplateId",
      table: s.workoutTemplates,
      owner: templateOwner,
    },
  });
  resource(app, "workout-sets", {
    table: s.workoutSets,
    schema: s.insertWorkoutSetSchema,
    owned: setOwner,
    immutable: ["completedWorkoutId", "exerciseId"],
    parent: {
      key: "completedWorkoutId",
      table: s.completedWorkouts,
      owner: workoutOwner,
    },
  });
  resource(app, "activities", {
    table: s.activities,
    schema: s.insertActivitySchema,
    owned: (uid) => eq(s.activities.userId, uid),
    direct: true,
    filters: (req) => [calendarDay(s.activities.date, req)],
  });
  resource(app, "meals", {
    table: s.meals,
    schema: s.insertMealSchema.extend({
      name: z.string().trim().min(1).max(200),
      calories: z.number().int().nonnegative().max(20000),
      protein: z.number().nonnegative().max(5000),
      carbs: z.number().nonnegative().max(5000),
      fat: z.number().nonnegative().max(5000),
    }),
    owned: (uid) => eq(s.meals.userId, uid),
    direct: true,
    filters: (req) => [calendarDay(s.meals.timestamp, req)],
  });
  resource(app, "health-metrics", {
    table: s.healthMetrics,
    schema: s.insertHealthMetricSchema.extend({
      metricType: z.enum(s.HealthMetricTypes),
    }),
    owned: (uid) => eq(s.healthMetrics.userId, uid),
    direct: true,
    filters: (req) => [
      ...range(s.healthMetrics.timestamp, req),
      ...(req.query.type
        ? [
            eq(
              s.healthMetrics.metricType,
              z.enum(s.HealthMetricTypes).parse(req.query.type),
            ),
          ]
        : []),
    ],
  });
  resource(app, "medications", {
    table: s.medications,
    schema: s.insertMedicationSchema.extend({
      category: z
        .enum(["supplement", "peptide", "medication"])
        .default("medication"),
      name: z.string().trim().min(1).max(160),
      dosage: z.string().trim().min(1).max(100),
      frequency: z.string().trim().min(1).max(150),
    }),
    owned: medicationOwner,
    direct: true,
  });
  const scheduleSchema = createInsertSchema(s.medicationSchedule).omit({
    id: true,
  });
  resource(app, "medication-schedules", {
    table: s.medicationSchedule,
    schema: scheduleSchema,
    owned: scheduleOwner,
    immutable: ["medicationId"],
    parent: {
      key: "medicationId",
      table: s.medications,
      owner: medicationOwner,
    },
  });
  app.get(
    "/api/users/:userId/medications/active",
    asyncHandler(async (req, res) =>
      res.json(
        await db
          .select()
          .from(s.medications)
          .where(
            and(
              medicationOwner(req.account.id),
              eq(s.medications.isActive, true),
            ),
          ),
      ),
    ),
  );
  app.get(
    "/api/users/:userId/medication-schedules",
    asyncHandler(async (req, res) =>
      res.json(
        await db
          .select()
          .from(s.medicationSchedule)
          .where(
            and(
              scheduleOwner(req.account.id),
              ...range(s.medicationSchedule.scheduledTime, req),
            ),
          ),
      ),
    ),
  );
  for (const child of [
    {
      path: "/api/workout-templates/:id/exercises",
      table: s.workoutTemplateExercises,
      column: s.workoutTemplateExercises.workoutTemplateId,
      owner: templateExerciseOwner,
    },
    {
      path: "/api/completed-workouts/:id/sets",
      table: s.workoutSets,
      column: s.workoutSets.completedWorkoutId,
      owner: setOwner,
    },
    {
      path: "/api/exercises/:id/sets",
      table: s.workoutSets,
      column: s.workoutSets.exerciseId,
      owner: setOwner,
    },
    {
      path: "/api/medications/:id/schedules",
      table: s.medicationSchedule,
      column: s.medicationSchedule.medicationId,
      owner: scheduleOwner,
    },
  ])
    app.get(
      child.path,
      asyncHandler(async (req, res) =>
        res.json(
          await db
            .select()
            .from(child.table)
            .where(
              and(
                eq(child.column, id(req.params.id)),
                child.owner(req.account.id),
              ),
            ),
        ),
      ),
    );

  app.get(
    "/api/users/:userId/daily-stats",
    asyncHandler(async (req, res) => {
      const date = new Date(`${selectedDay(req)}T00:00:00.000Z`);
      await db
        .insert(s.dailyStats)
        .values({ userId: req.account.id, date })
        .onConflictDoNothing();
      const [stats] = await db
        .select()
        .from(s.dailyStats)
        .where(
          and(
            eq(s.dailyStats.userId, req.account.id),
            eq(s.dailyStats.date, date),
          ),
        );
      // Compute nutrition from source records: no drifting counters or historical-edit races.
      const [totals] = await db
        .select({
          caloriesConsumed:
            sql<number>`coalesce(sum(${s.meals.calories}),0)`.mapWith(Number),
          proteinConsumed:
            sql<number>`coalesce(sum(${s.meals.protein}),0)`.mapWith(Number),
          carbsConsumed: sql<number>`coalesce(sum(${s.meals.carbs}),0)`.mapWith(
            Number,
          ),
          fatConsumed: sql<number>`coalesce(sum(${s.meals.fat}),0)`.mapWith(
            Number,
          ),
        })
        .from(s.meals)
        .where(
          and(
            eq(s.meals.userId, req.account.id),
            calendarDay(s.meals.timestamp, req),
          ),
        );
      res.json({ ...stats, ...totals });
    }),
  );
  app.patch(
    "/api/daily-stats/:id",
    asyncHandler(async (req, res) => {
      const data = z
        .object({
          waterIntake: z.number().nonnegative().max(30),
          stepsCount: z.number().int().nonnegative().max(200000),
          weightMeasurement: z.number().positive().max(1000),
        })
        .partial()
        .strict()
        .parse(req.body);
      if (!Object.keys(data).length)
        return res
          .status(400)
          .json({ message: "No editable fields supplied." });
      const [stats] = await db
        .update(s.dailyStats)
        .set(data)
        .where(
          and(
            eq(s.dailyStats.id, id(req.params.id)),
            eq(s.dailyStats.userId, req.account.id),
          ),
        )
        .returning();
      if (!stats) throw notFound();
      res.json(stats);
    }),
  );

  app.get(
    "/api/nutrition/search",
    asyncHandler(async (req, res) => {
      const query = z.string().trim().min(2).max(150).parse(req.query.q);
      if (!process.env.NUTRITIONIX_APP_ID || !process.env.NUTRITIONIX_API_KEY)
        return res.status(503).json({
          message:
            "Food search is not configured. You can enter food and macros manually.",
        });
      res.json(await searchFoods(query));
    }),
  );
  app.get(
    "/api/nutrition/barcode/:barcode",
    asyncHandler(async (req, res) => {
      const barcode = z
        .string()
        .regex(/^\d{8,14}$/)
        .parse(req.params.barcode);
      const food = await getProductByBarcode(barcode);
      if (!food) throw notFound();
      res.json(food);
    }),
  );
  const connections = () =>
    Object.fromEntries(
      ["whoop", "oura", "gmail", "outlook"].map((provider) => [
        provider,
        { connected: false, last_sync: null, status: "not_configured" },
      ]),
    );
  app.get(
    "/api/check-in",
    asyncHandler(async (req, res) => {
      const [entry] = await db
        .select()
        .from(s.dailyCheckIns)
        .where(
          and(
            eq(s.dailyCheckIns.userId, req.account.id),
            eq(s.dailyCheckIns.day, dayKey(new Date(), req.account.timezone)),
          ),
        );
      res.json(entry || null);
    }),
  );
  app.post(
    "/api/check-in",
    asyncHandler(async (req, res) => {
      const data = z
        .object({
          energy: z.enum(["low", "usual", "high"]),
          soreness: z.enum(["none", "some", "high"]),
          limited: z.boolean(),
        })
        .strict()
        .parse(req.body);
      const [entry] = await db
        .insert(s.dailyCheckIns)
        .values({
          ...data,
          userId: req.account.id,
          day: dayKey(new Date(), req.account.timezone),
        })
        .onConflictDoUpdate({
          target: [s.dailyCheckIns.userId, s.dailyCheckIns.day],
          set: { ...data, updatedAt: new Date() },
        })
        .returning();
      res.json(entry);
    }),
  );
  app.get("/api/users/:userId/health-integrations", (_req, res) =>
    res.json(connections()),
  );
  app.post("/api/health-integrations/connect", (_req, res) =>
    res.status(501).json({
      message:
        "Account connections are being implemented. No account has been connected.",
    }),
  );
  app.get("/api/users/:userId/health-integrations/sync", (_req, res) =>
    res
      .status(409)
      .json({ message: "Connect a supported account before syncing." }),
  );
  app.post("/api/generate-workout", (_req, res) =>
    res.status(501).json({
      message:
        "Adaptive planning is being implemented. Create a workout manually for now.",
    }),
  );
  app.get("/api/subscription-plans", (_req, res) => res.json([]));
  app.get("/api/users/:userId/check-access/:feature", (_req, res) =>
    res.json({ hasAccess: true }),
  );
  app.get("/api/users/:userId/subscription", (_req, res) =>
    res.json({
      plan: { name: "Private beta", price: 0, features: [] },
      expiryDate: null,
    }),
  );
  app.get("/api/users/:userId/subscription-transactions", (_req, res) =>
    res.json([]),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "Endpoint not found." }),
  );
  return createServer(app);
}
