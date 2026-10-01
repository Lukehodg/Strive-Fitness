import type { Express } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import * as s from "../../shared/schema";
import { coachRecommendationSchema, coachRequestSchema, coachTodaySchema, coachDecisionRequestSchema } from "../../shared/coach";
import { asyncHandler } from "../auth";
import { coachError, localDay, readContext, type CoachTransaction } from "./context";
import { planWorkout } from "./planner";
import { createSavedSession } from "../training-session";

type Record = typeof s.coachRecommendations.$inferSelect;
async function view(tx: CoachTransaction, record: Record, now: Date) {
  const [decision] = await tx.select({ id: s.coachDecisions.id, choice: s.coachDecisions.choice, sessionId: s.coachDecisions.sessionId }).from(s.coachDecisions)
    .where(and(eq(s.coachDecisions.recommendationId, record.id), eq(s.coachDecisions.userId, record.userId)));
  const context = await readContext(tx, record.userId, record.templateId, now, record.scheduledId);
  const staleReason = record.expiresAt <= now ? "expired" : !context ? "template_unavailable"
    : context.inputHash !== record.inputHash ? "inputs_changed" : null;
  return coachRecommendationSchema.parse({ ...record.snapshot,
    id: record.id, createdAt: record.createdAt.toISOString(), expiresAt: record.expiresAt.toISOString(),
    stale: staleReason !== null, staleReason, decision: decision ?? null,
  });
}

// Acceptance/start are short DB-only transactions. SHARE ROW EXCLUSIVE locks coordinate
// legacy CRUD and provider writers, including inserts absent from the snapshot.
// READ COMMITTED takes the context snapshot AFTER the locks have been acquired.
async function decisionTransaction<T>(userId: number, fn: (tx: CoachTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
        await tx.execute(sql`LOCK TABLE users, workout_templates, workout_template_exercises, exercises, daily_check_ins, wearable_connections, wearable_days, scheduled_workouts IN SHARE ROW EXCLUSIVE MODE`);
        await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId)).for("update");
        return fn(tx);
      }, { isolationLevel: "read committed" });
    } catch (error) {
      const e = error as { code?: string; cause?: { code?: string } };
      const code = e.code || e.cause?.code;
      if (code === "40P01" && attempt < 2) continue;
      if (["40P01", "55P03"].includes(code || "")) coachError("Your records are updating. Please retry.", 409);
      throw error;
    }
  }
}

async function requireCurrent(tx: CoachTransaction, record: Record) {
  const current = await view(tx, record, new Date());
  if (current.stale || current.status !== "ready" || !current.proposed)
    coachError("Your guidance has changed or needs a check-in. Refresh and review the workout again.", 409);
}

// A competing retry may commit after our repeatable-read snapshot was taken.
// Retry only database serialization failures; request keys make retries safe.
async function transaction<T>(fn: (tx: CoachTransaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.transaction(fn, { isolationLevel: "repeatable read" }); }
    catch (error) {
      const e = error as { code?: string; cause?: { code?: string } };
      if ((e.code || e.cause?.code) !== "40001") throw error;
      if (attempt >= 2) return coachError("Your data changed while building the preview. Please retry.", 409);
    }
  }
}

export function registerCoach(app: Express) {
  app.use("/api/coach", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.post("/api/coach/recommendations/:id/decision", asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { choice } = coachDecisionRequestSchema.parse(req.body);
    const result = await decisionTransaction(req.account.id, async (tx) => {
      const [record] = await tx.select().from(s.coachRecommendations).where(and(eq(s.coachRecommendations.id, id), eq(s.coachRecommendations.userId, req.account.id)));
      if (!record) return coachError("Recommendation not found.", 404);
      const [existing] = await tx.select().from(s.coachDecisions).where(eq(s.coachDecisions.recommendationId, id));
      if (existing) {
        if (existing.choice !== choice) coachError("This preview already has a saved choice. Create a new preview to change it.", 409);
        return view(tx, record, new Date());
      }
      await requireCurrent(tx, record);
      await tx.insert(s.coachDecisions).values({ userId: req.account.id, recommendationId: id, choice,
        plan: choice === "original" ? record.snapshot.original : record.snapshot.proposed!,
      });
      return view(tx, record, new Date());
    });
    res.json(result);
  }));
  app.post("/api/coach/decisions/:id/start", asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    z.object({}).strict().parse(req.body ?? {});
    const result = await decisionTransaction(req.account.id, async (tx) => {
      const [decision] = await tx.select().from(s.coachDecisions).where(and(eq(s.coachDecisions.id, id), eq(s.coachDecisions.userId, req.account.id)));
      if (!decision) return coachError("Decision not found.", 404);
      if (decision.sessionId) {
        const [session] = await tx.select().from(s.completedWorkouts).where(and(eq(s.completedWorkouts.id, decision.sessionId), eq(s.completedWorkouts.userId, req.account.id)));
        return session;
      }
      const [active] = await tx.select().from(s.completedWorkouts).where(and(eq(s.completedWorkouts.userId, req.account.id), eq(s.completedWorkouts.isCompleted, false), isNull(s.completedWorkouts.endTime)));
      if (active) return coachError("You already have an active workout. Resume or finish it before starting this plan.", 409);
      const [record] = await tx.select().from(s.coachRecommendations).where(eq(s.coachRecommendations.id, decision.recommendationId));
      await requireCurrent(tx, record);
      const session = await createSavedSession(tx, req.account.id, record.templateId, { name: decision.plan.name, exercises: decision.plan.exercises,
          coach: { recommendationId: record.id, decisionId: decision.id, choice: decision.choice, reasons: record.snapshot.reasons.map((r) => r.text) },
      });
      await tx.update(s.coachDecisions).set({ sessionId: session.id }).where(eq(s.coachDecisions.id, decision.id));
      if (record.scheduledId) await tx.update(s.scheduledWorkouts).set({ sessionId: session.id, revision: sql`${s.scheduledWorkouts.revision} + 1` }).where(eq(s.scheduledWorkouts.id, record.scheduledId));
      return session;
    });
    res.json(result);
  }));
  app.post("/api/coach/recommendations", asyncHandler(async (req, res) => {
    const input = coachRequestSchema.parse(req.body);
    const result = await transaction(async (tx) => {
      const now = new Date();
      const [existing] = await tx.select().from(s.coachRecommendations).where(and(
        eq(s.coachRecommendations.userId, req.account.id), eq(s.coachRecommendations.requestKey, input.requestKey),
      ));
      if (existing) {
        if (existing.templateId !== input.templateId || existing.scheduledId !== (input.scheduledId ?? null)) coachError("This request key was used for a different workout.", 409);
        return { created: false, recommendation: await view(tx, existing, now) };
      }
      const context = await readContext(tx, req.account.id, input.templateId, now, input.scheduledId);
      if (!context) return coachError("Workout unavailable. Choose an owned strength workout with valid targets.", 404);
      const snapshot = planWorkout(context.inputs, context.original);
      const [inserted] = await tx.insert(s.coachRecommendations).values({
        userId: req.account.id, templateId: input.templateId, scheduledId: input.scheduledId ?? null, requestKey: input.requestKey,
        inputHash: context.inputHash, snapshot, createdAt: now, expiresAt: new Date(now.getTime() + 6 * 3600_000),
      }).onConflictDoNothing({ target: [s.coachRecommendations.userId, s.coachRecommendations.requestKey] }).returning();
      if (!inserted) return coachError("A preview with this request key is being created. Please retry.", 409);
      return { created: true, recommendation: await view(tx, inserted, now) };
    });
    res.status(result.created ? 201 : 200).json(result.recommendation);
  }));
  app.get("/api/coach/recommendations/:id", asyncHandler(async (req, res) => {
    const id = z.coerce.number().int().positive().max(2147483647).parse(req.params.id);
    const recommendation = await transaction(async (tx) => {
      const [record] = await tx.select().from(s.coachRecommendations).where(and(
        eq(s.coachRecommendations.id, id), eq(s.coachRecommendations.userId, req.account.id),
      ));
      if (!record) return coachError("Recommendation not found.", 404);
      return view(tx, record, new Date());
    });
    res.json(recommendation);
  }));
  app.get("/api/coach/today", asyncHandler(async (req, res) => {
    const result = await transaction(async (tx) => {
      const now = new Date();
      const [account] = await tx.select({ timezone: s.users.timezone }).from(s.users).where(eq(s.users.id, req.account.id));
      const day = localDay(now, account.timezone);
      const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: account.timezone, weekday: "long" }).format(now);
      const scheduledWorkouts = await tx.select({ id: s.scheduledWorkouts.id, templateId: s.scheduledWorkouts.templateId, name: s.scheduledWorkouts.name, sessionId: s.scheduledWorkouts.sessionId }).from(s.scheduledWorkouts)
        .where(and(eq(s.scheduledWorkouts.userId, req.account.id), eq(s.scheduledWorkouts.day, day), eq(s.scheduledWorkouts.timezone, account.timezone), eq(s.scheduledWorkouts.skipped, false))).orderBy(s.scheduledWorkouts.id);
      const templates = await tx.select({ id: s.workoutTemplates.id, name: s.workoutTemplates.name, scheduledDay: s.workoutTemplates.scheduledDay })
        .from(s.workoutTemplates).where(eq(s.workoutTemplates.userId, req.account.id)).orderBy(s.workoutTemplates.id);
      const [latest] = await tx.select().from(s.coachRecommendations).where(eq(s.coachRecommendations.userId, req.account.id))
        .orderBy(desc(s.coachRecommendations.id)).limit(1);
      const activeSessions = await tx.select({ id: s.completedWorkouts.id, templateId: s.completedWorkouts.workoutTemplateId })
        .from(s.completedWorkouts).where(and(eq(s.completedWorkouts.userId, req.account.id), eq(s.completedWorkouts.isCompleted, false), isNull(s.completedWorkouts.endTime)))
        .orderBy(desc(s.completedWorkouts.id));
      return { day, timezone: account.timezone, templates, scheduledWorkouts,
        scheduledTemplateIds: templates.filter((t) => t.scheduledDay === weekday).map((t) => t.id), activeSessions,
        recommendation: latest && latest.snapshot.inputs.day === day && latest.snapshot.inputs.timezone === account.timezone ? await view(tx, latest, now) : null,
      };
    });
    res.json(coachTodaySchema.parse(result));
  }));
}
