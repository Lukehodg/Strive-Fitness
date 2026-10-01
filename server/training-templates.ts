import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import * as s from "../shared/schema";
import { templateInput } from "./training";
import { asyncHandler } from "./auth";
import { coachError, type CoachTransaction } from "./coach/context";
const id = z.coerce.number().int().positive().max(2147483647);
async function readTemplate(tx: CoachTransaction, userId: number, templateId: number) {
  const [template] = await tx.select().from(s.workoutTemplates).where(and(eq(s.workoutTemplates.id, templateId), eq(s.workoutTemplates.userId, userId)));
  if (!template) return coachError("Workout not found.", 404);
  const rows = await tx.select({ exerciseId: s.exercises.id, name: s.exercises.name, sets: s.workoutTemplateExercises.sets,
    repsMin: s.workoutTemplateExercises.repsMin, repsMax: s.workoutTemplateExercises.repsMax, restSeconds: s.workoutTemplateExercises.restSeconds,
  }).from(s.workoutTemplateExercises).innerJoin(s.exercises, eq(s.exercises.id, s.workoutTemplateExercises.exerciseId))
    .where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId)).orderBy(asc(s.workoutTemplateExercises.order), asc(s.workoutTemplateExercises.id));
  const value = { id: template.id, name: template.name, duration: template.duration, scheduledDay: template.scheduledDay, exercises: rows.map(r => ({ ...r, restSeconds: r.restSeconds ?? 90 })) };
  return { ...value, version: createHash("sha256").update(JSON.stringify(value)).digest("hex") };
}
export function registerTemplateEditing(app: Express) {
  app.get("/api/training/templates/:id", asyncHandler(async (req, res) => {
    res.json(await db.transaction(tx => readTemplate(tx, req.account.id, id.parse(req.params.id)), { isolationLevel: "repeatable read" }));
  }));
  app.put("/api/training/templates/:id", asyncHandler(async (req, res) => {
    const raw = z.record(z.unknown()).parse(req.body);
    const version = z.string().regex(/^[a-f0-9]{64}$/).parse(raw.version);
    const { version: _version, ...body } = raw;
    const input = templateInput.parse({ ...body, requestKey: randomUUID() });
    const templateId = id.parse(req.params.id);
    const result = await db.transaction(async tx => {
      await tx.select({ id: s.workoutTemplates.id }).from(s.workoutTemplates).where(and(eq(s.workoutTemplates.id, templateId), eq(s.workoutTemplates.userId, req.account.id))).for("update");
      const current = await readTemplate(tx, req.account.id, templateId);
      if (current.version !== version) coachError("This workout was edited elsewhere. Reload before making changes.", 409);
      const exercises = await tx.select().from(s.exercises).where(inArray(s.exercises.id, input.exercises.map(e => e.exerciseId)));
      if (exercises.length !== input.exercises.length || exercises.some(e => e.measurementType && e.measurementType !== "weight_reps")) coachError("Choose existing strength exercises.", 400);
      await tx.update(s.workoutTemplates).set({ name: input.name, duration: input.duration, scheduledDay: input.scheduledDay, exerciseCount: input.exercises.length }).where(eq(s.workoutTemplates.id, templateId));
      await tx.delete(s.workoutTemplateExercises).where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId));
      await tx.insert(s.workoutTemplateExercises).values(input.exercises.map((e, order) => ({ ...e, order, workoutTemplateId: templateId })));
      return readTemplate(tx, req.account.id, templateId);
    });
    res.json(result);
  }));
}
