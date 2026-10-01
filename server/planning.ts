import type { Express } from "express";
import { and, asc, eq, gte, lte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import * as s from "../shared/schema";
import { asyncHandler } from "./auth";
import { localDay, coachError } from "./coach/context";
import { calendarDate, scheduleBuildSchema, scheduleEditSchema, sessionFeedbackSchema, type TrainingWeek } from "../shared/planning";

export function addDays(day: string, days: number) { return new Date(Date.parse(day) + days * 86400000).toISOString().slice(0, 10); }
const id = z.coerce.number().int().positive().max(2147483647);
export function registerPlanning(app: Express) {
  app.use("/api/planning", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.post("/api/planning/build", asyncHandler(async (req, res) => {
    const input = scheduleBuildSchema.parse(req.body);
    const today = localDay(new Date(), req.account.timezone);
    if (input.start < today || input.start > addDays(today, 90)) coachError("Choose a starting date between today and 90 days from now.", 400);
    const added = await db.transaction(async tx => {
      const templates = await tx.select().from(s.workoutTemplates).where(eq(s.workoutTemplates.userId, req.account.id));
      const rows = [];
      for (let offset = 0; offset < input.weeks * 7; offset++) {
        const day = addDays(input.start, offset);
        const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(day));
        for (const template of templates.filter(t => t.scheduledDay === weekday)) rows.push({
          userId: req.account.id, templateId: template.id, name: template.name, day, originDay: day, timezone: req.account.timezone,
        });
      }
      if (!rows.length) coachError("Assign weekdays to your saved workouts before building a plan.", 400);
      const inserted = await tx.insert(s.scheduledWorkouts).values(rows).onConflictDoNothing().returning({ id: s.scheduledWorkouts.id });
      return inserted.length;
    });
    res.json({ added, start: input.start, end: addDays(input.start, input.weeks * 7 - 1) });
  }));
  app.get("/api/planning/week", asyncHandler(async (req, res) => {
    const today = localDay(new Date(), req.account.timezone);
    const start = req.query.start === undefined ? today : calendarDate.parse(req.query.start);
    const end = addDays(start, 6);
    const rows = await db.select({ scheduled: s.scheduledWorkouts, completed: s.completedWorkouts.isCompleted })
      .from(s.scheduledWorkouts).leftJoin(s.completedWorkouts, eq(s.completedWorkouts.id, s.scheduledWorkouts.sessionId))
      .where(and(eq(s.scheduledWorkouts.userId, req.account.id), gte(s.scheduledWorkouts.day, start), lte(s.scheduledWorkouts.day, end)))
      .orderBy(asc(s.scheduledWorkouts.day), asc(s.scheduledWorkouts.id));
    const result: TrainingWeek = { start, end, today, timezone: req.account.timezone, workouts: rows.map(({ scheduled: w, completed }) => ({
      id: w.id, templateId: w.templateId, name: w.name, day: w.day, timezone: w.timezone, revision: w.revision, sessionId: w.sessionId,
      status: w.sessionId ? completed ? "completed" : "in_progress" : w.skipped ? "skipped" : w.day < localDay(new Date(), w.timezone) ? "missed" : "planned",
    })) };
    res.json(result);
  }));
  app.patch("/api/planning/workouts/:id", asyncHandler(async (req, res) => {
    const input = scheduleEditSchema.parse(req.body);
    const today = localDay(new Date(), req.account.timezone);
    if (input.day && (input.day < today || input.day > addDays(today, 365))) coachError("Choose a date within the next year.", 400);
    const [updated] = await db.update(s.scheduledWorkouts).set({ ...(input.day ? { day: input.day } : {}),
      ...(input.skipped !== undefined ? { skipped: input.skipped } : {}), revision: sql`${s.scheduledWorkouts.revision} + 1`,
    }).where(and(eq(s.scheduledWorkouts.id, id.parse(req.params.id)), eq(s.scheduledWorkouts.userId, req.account.id), eq(s.scheduledWorkouts.revision, input.revision), isNull(s.scheduledWorkouts.sessionId))).returning();
    if (!updated) coachError("This scheduled workout changed or already started. Refresh your plan.", 409);
    res.json(updated);
  }));
  app.get("/api/training/sessions/:id/feedback", asyncHandler(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const sessionId = id.parse(req.params.id);
    const [session] = await db.select({ id: s.completedWorkouts.id }).from(s.completedWorkouts).where(and(eq(s.completedWorkouts.id, sessionId), eq(s.completedWorkouts.userId, req.account.id)));
    if (!session) coachError("Session not found.", 404);
    const [feedback] = await db.select().from(s.sessionFeedback).where(and(eq(s.sessionFeedback.sessionId, sessionId), eq(s.sessionFeedback.userId, req.account.id)));
    res.json(feedback?.response ?? null);
  }));
  app.put("/api/training/sessions/:id/feedback", asyncHandler(async (req, res) => {
    const response = sessionFeedbackSchema.parse(req.body);
    const sessionId = id.parse(req.params.id);
    await db.transaction(async tx => {
      const [session] = await tx.select().from(s.completedWorkouts).where(and(eq(s.completedWorkouts.id, sessionId), eq(s.completedWorkouts.userId, req.account.id))).for("update");
      if (!session) coachError("Session not found.", 404);
      if (!session.isCompleted) coachError("Finish the session before recording feedback.", 409);
      await tx.insert(s.sessionFeedback).values({ userId: req.account.id, sessionId, response }).onConflictDoUpdate({ target: s.sessionFeedback.sessionId, set: { response, updatedAt: new Date() } });
    });
    res.json(response);
  }));
}
