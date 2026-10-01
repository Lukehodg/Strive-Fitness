import type { Express, Request, Response, NextFunction } from "express";
import { and, eq, isNull, asc, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import * as s from "../shared/schema";
import { asyncHandler } from "./auth";
import { getReadiness } from "./readiness";
import { createSavedSession } from "./training-session";
import { completedPerformance, summarizePerformance, sessionAchievements } from "./training-records";
const positiveId = z.coerce.number().int().positive().max(2147483647);
const fail = (message: string, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const exerciseInput = z
  .object({
    exerciseId: positiveId,
    sets: z.number().int().min(1).max(20),
    repsMin: z.number().int().min(1).max(200),
    repsMax: z.number().int().min(1).max(200),
    restSeconds: z.number().int().min(0).max(1800),
  })
  .strict()
  .refine(
    (value) => value.repsMax >= value.repsMin,
    "Maximum reps must be at least minimum reps.",
  );
export const templateInput = z
  .object({
    requestKey: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    duration: z.number().int().min(1).max(240),
    scheduledDay: z
      .enum([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ])
      .nullable(),
    exercises: z.array(exerciseInput).min(1).max(30),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.exercises.map((item) => item.exerciseId)).size ===
      value.exercises.length,
    "Choose each exercise once.",
  );
export function registerTraining(app: Express) {
  app.get("/api/training/records", asyncHandler(async (req, res) => {
    res.json(summarizePerformance(await completedPerformance(req.account.id)));
  }));
  app.post(
    "/api/training/templates",
    asyncHandler(async (req, res) => {
      const input = templateInput.parse(req.body);
      const result = await db.transaction(async (tx) => {
        await tx
          .select({ id: s.users.id })
          .from(s.users)
          .where(eq(s.users.id, req.account.id))
          .for("update");
        const [existing] = await tx
          .select()
          .from(s.workoutTemplates)
          .where(
            and(
              eq(s.workoutTemplates.userId, req.account.id),
              eq(s.workoutTemplates.creationKey, input.requestKey),
            ),
          );
        if (existing) {
          const rows = await tx
            .select()
            .from(s.workoutTemplateExercises)
            .where(
              eq(s.workoutTemplateExercises.workoutTemplateId, existing.id),
            )
            .orderBy(asc(s.workoutTemplateExercises.order));
          const matches =
            existing.name === input.name &&
            existing.duration === input.duration &&
            existing.scheduledDay === input.scheduledDay &&
            rows.length === input.exercises.length &&
            rows.every((row, index) => {
              const expected = input.exercises[index];
              return (
                row.exerciseId === expected.exerciseId &&
                row.sets === expected.sets &&
                row.repsMin === expected.repsMin &&
                row.repsMax === expected.repsMax &&
                row.restSeconds === expected.restSeconds
              );
            });
          if (!matches)
            fail(
              "This workout was already saved. Return to Train to view it.",
              409,
            );
          return existing;
        }
        const exercises = await tx
          .select()
          .from(s.exercises)
          .where(
            inArray(
              s.exercises.id,
              input.exercises.map((item) => item.exerciseId),
            ),
          );
        if (exercises.length !== input.exercises.length)
          fail("An exercise no longer exists.");
        if (
          exercises.some(
            (item) =>
              item.measurementType && item.measurementType !== "weight_reps",
          )
        )
          fail("This builder currently supports strength exercises only.");
        const [template] = await tx
          .insert(s.workoutTemplates)
          .values({
            userId: req.account.id,
            name: input.name,
            duration: input.duration,
            scheduledDay: input.scheduledDay,
            exerciseCount: input.exercises.length,
            creationKey: input.requestKey,
            color: "#bcead7",
          })
          .returning();
        await tx.insert(s.workoutTemplateExercises).values(
          input.exercises.map((item, order) => ({
            ...item,
            workoutTemplateId: template.id,
            order,
          })),
        );
        return template;
      });
      res.status(201).json(result);
    }),
  );
  app.get(
    "/api/training/sessions",
    asyncHandler(async (req, res) =>
      res.json(
        await db
          .select()
          .from(s.completedWorkouts)
          .where(eq(s.completedWorkouts.userId, req.account.id))
          .orderBy(desc(s.completedWorkouts.startTime))
          .limit(100),
      ),
    ),
  );
  app.post(
    "/api/training/templates/:id/start",
    asyncHandler(async (req, res) => {
      const templateId = positiveId.parse(req.params.id);
      const { lighter } = z
        .object({ lighter: z.boolean().default(false) })
        .strict()
        .parse(req.body || {});
      const guidance = lighter
        ? await getReadiness(req.account.id, req.account.timezone)
        : null;
      const result = await db.transaction(async (tx) => {
        await tx
          .select({ id: s.users.id })
          .from(s.users)
          .where(eq(s.users.id, req.account.id))
          .for("update");
        const [template] = await tx
          .select()
          .from(s.workoutTemplates)
          .where(
            and(
              eq(s.workoutTemplates.id, templateId),
              eq(s.workoutTemplates.userId, req.account.id),
            ),
          );
        if (!template) return fail("Workout not found.", 404);
        const [active] = await tx
          .select()
          .from(s.completedWorkouts)
          .where(
            and(
              eq(s.completedWorkouts.userId, req.account.id),
              eq(s.completedWorkouts.workoutTemplateId, templateId),
              eq(s.completedWorkouts.isCompleted, false),
              isNull(s.completedWorkouts.endTime),
            ),
          );
        if (active?.planSnapshot) return active;
        if (lighter && !guidance?.canReduceSets)
          fail(
            "Today's guidance has changed. Review your check-in before choosing a session.",
            409,
          );
        const exercises = await tx
          .select({
            exerciseId: s.exercises.id,
            name: s.exercises.name,
            sets: s.workoutTemplateExercises.sets,
            repsMin: s.workoutTemplateExercises.repsMin,
            repsMax: s.workoutTemplateExercises.repsMax,
            restSeconds: s.workoutTemplateExercises.restSeconds,
            measurementType: s.exercises.measurementType,
          })
          .from(s.workoutTemplateExercises)
          .innerJoin(
            s.exercises,
            eq(s.exercises.id, s.workoutTemplateExercises.exerciseId),
          )
          .where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId))
          .orderBy(asc(s.workoutTemplateExercises.order));
        if (!exercises.length)
          fail("Add exercises before starting this workout.");
        if (
          exercises.some(
            (item) =>
              item.measurementType && item.measurementType !== "weight_reps",
          )
        )
          fail("Native logging currently supports strength workouts only.");
        const planSnapshot = {
          name: template.name,
          ...(guidance
            ? {
                guidance: {
                  version: guidance.version,
                  assessedAt: guidance.assessedAt,
                  mode: guidance.mode,
                  reasons: guidance.reasons,
                },
              }
            : {}),
          exercises: exercises.map((item) => ({
            ...item,
            sets: lighter
              ? Math.max(1, Math.floor(item.sets * 0.75))
              : item.sets,
            restSeconds: item.restSeconds ?? 90,
          })),
        };
        return createSavedSession(tx, req.account.id, templateId, planSnapshot);
      });
      res.status(201).json(result);
    }),
  );
  app.get(
    "/api/training/sessions/:id",
    asyncHandler(async (req, res) => {
      const [workout] = await db
        .select()
        .from(s.completedWorkouts)
        .where(
          and(
            eq(s.completedWorkouts.id, positiveId.parse(req.params.id)),
            eq(s.completedWorkouts.userId, req.account.id),
          ),
        );
      if (!workout) return fail("Session not found.", 404);
      const sets = await db
        .select()
        .from(s.workoutSets)
        .where(eq(s.workoutSets.completedWorkoutId, workout.id))
        .orderBy(asc(s.workoutSets.id));
      const history = await completedPerformance(req.account.id);
      const prior = history.filter(row => row.sessionId !== workout.id &&
        (!workout.endTime || row.finishedAt < workout.endTime.toISOString() ||
          (row.finishedAt === workout.endTime.toISOString() && row.sessionId < workout.id)));
      const current = sets.filter(set => set.isCompleted && set.weight !== null && set.reps !== null).map(set => ({
        exerciseId: set.exerciseId, name: workout.planSnapshot?.exercises.find(e => e.exerciseId === set.exerciseId)?.name || "Exercise",
        sessionId: workout.id, setNumber: set.setNumber, weight: set.weight!, reps: set.reps!, finishedAt: workout.endTime?.toISOString() || "",
      }));
      res.json({ workout, sets, performance: summarizePerformance(prior), achievements: sessionAchievements(prior, current) });
    }),
  );
  app.put(
    "/api/training/sessions/:id/sets",
    asyncHandler(async (req, res) => {
      const input = z
        .object({
          exerciseId: positiveId,
          setNumber: z.number().int().min(1).max(20),
          weight: z.number().min(0).max(1500),
          reps: z.number().int().min(1).max(200),
          rpe: z.number().int().min(1).max(10).nullable(),
        })
        .strict()
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        const [workout] = await tx
          .select()
          .from(s.completedWorkouts)
          .where(
            and(
              eq(s.completedWorkouts.id, positiveId.parse(req.params.id)),
              eq(s.completedWorkouts.userId, req.account.id),
            ),
          )
          .for("update");
        if (!workout) return fail("Session not found.", 404);
        if (workout.isCompleted || workout.endTime)
          return fail("This session is already finished.", 409);
        const planned = workout.planSnapshot?.exercises.find(
          (item) => item.exerciseId === input.exerciseId,
        );
        if (!planned || input.setNumber > planned.sets)
          return fail("This set is not in the session plan.");
        const [existing] = await tx
          .select()
          .from(s.workoutSets)
          .where(
            and(
              eq(s.workoutSets.completedWorkoutId, workout.id),
              eq(s.workoutSets.exerciseId, input.exerciseId),
              eq(s.workoutSets.setNumber, input.setNumber),
            ),
          );
        const values = { ...input, isCompleted: true, timestamp: new Date() };
        const [saved] = existing
          ? await tx
              .update(s.workoutSets)
              .set(values)
              .where(eq(s.workoutSets.id, existing.id))
              .returning()
          : await tx
              .insert(s.workoutSets)
              .values({ ...values, completedWorkoutId: workout.id })
              .returning();
        return saved;
      });
      res.json(result);
    }),
  );
  app.post(
    "/api/training/sessions/:id/finish",
    asyncHandler(async (req, res) => {
      const result = await db.transaction(async (tx) => {
        const [workout] = await tx
          .select()
          .from(s.completedWorkouts)
          .where(
            and(
              eq(s.completedWorkouts.id, positiveId.parse(req.params.id)),
              eq(s.completedWorkouts.userId, req.account.id),
            ),
          )
          .for("update");
        if (!workout) return fail("Session not found.", 404);
        if (workout.isCompleted) return workout;
        const [updated] = await tx
          .update(s.completedWorkouts)
          .set({ isCompleted: true, endTime: new Date() })
          .where(eq(s.completedWorkouts.id, workout.id))
          .returning();
        return updated;
      });
      res.json(result);
    }),
  );
  // Legacy writes cannot bypass the lifecycle of a snapshotted native session.
  const guard =
    (kind: "set" | "session") =>
    (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        let sessionId: number;
        if (kind === "session") sessionId = positiveId.parse(req.params.id);
        else if (req.method === "POST")
          sessionId = positiveId.parse(req.body.completedWorkoutId);
        else {
          const [set] = await db
            .select()
            .from(s.workoutSets)
            .where(eq(s.workoutSets.id, positiveId.parse(req.params.id)));
          if (!set) return next();
          sessionId = set.completedWorkoutId;
        }
        const [workout] = await db
          .select()
          .from(s.completedWorkouts)
          .where(
            and(
              eq(s.completedWorkouts.id, sessionId),
              eq(s.completedWorkouts.userId, req.account.id),
            ),
          );
        if (workout?.planSnapshot)
          return res.status(409).json({
            message:
              "Use the training session controls to update this workout.",
          });
        next();
      })().catch(next);
    };
  app.post("/api/workout-sets", guard("set"));
  app.patch("/api/workout-sets/:id", guard("set"));
  app.delete("/api/workout-sets/:id", guard("set"));
  app.patch("/api/completed-workouts/:id", guard("session"));
  app.delete("/api/completed-workouts/:id", guard("session"));
}
