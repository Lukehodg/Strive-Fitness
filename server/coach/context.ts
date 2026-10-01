import { createHash } from "node:crypto";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import * as s from "../../shared/schema";
import { coachInputsSchema, coachPlanSchema } from "../../shared/coach";
import { assessReadiness } from "../readiness";
import { COACH_POLICY } from "./planner";

export type CoachTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const localDay = (now: Date, timezone: string) => new Intl.DateTimeFormat("en-CA", {
  timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);
export function coachError(message: string, status: number): never {
  throw Object.assign(new Error(message), { status });
}

// Call inside repeatable-read (previews) or with input-table locks (accept/start).
export async function readContext(tx: CoachTransaction, userId: number, templateId: number, now: Date, scheduledId?: number | null) {
  const [user] = await tx.select({ timezone: s.users.timezone }).from(s.users).where(eq(s.users.id, userId));
  if (!user) return coachError("Account not found.", 404);
  const day = localDay(now, user.timezone);
  const [scheduled] = scheduledId ? await tx.select({ id: s.scheduledWorkouts.id, day: s.scheduledWorkouts.day,
    timezone: s.scheduledWorkouts.timezone, revision: s.scheduledWorkouts.revision, skipped: s.scheduledWorkouts.skipped, sessionId: s.scheduledWorkouts.sessionId,
  }).from(s.scheduledWorkouts).where(and(eq(s.scheduledWorkouts.id, scheduledId), eq(s.scheduledWorkouts.userId, userId), eq(s.scheduledWorkouts.templateId, templateId))) : [];
  if (scheduledId && !scheduled) return null;
  const [template] = await tx.select().from(s.workoutTemplates).where(and(eq(s.workoutTemplates.id, templateId), eq(s.workoutTemplates.userId, userId)));
  if (!template) return null;
  const rows = await tx.select({
    exerciseId: s.exercises.id, name: s.exercises.name,
    sets: s.workoutTemplateExercises.sets, repsMin: s.workoutTemplateExercises.repsMin,
    repsMax: s.workoutTemplateExercises.repsMax, restSeconds: s.workoutTemplateExercises.restSeconds,
    measurementType: s.exercises.measurementType,
  }).from(s.workoutTemplateExercises).innerJoin(s.exercises, eq(s.exercises.id, s.workoutTemplateExercises.exerciseId))
    .where(eq(s.workoutTemplateExercises.workoutTemplateId, templateId))
    .orderBy(asc(s.workoutTemplateExercises.order), asc(s.workoutTemplateExercises.id));
  const plan = coachPlanSchema.safeParse({ name: template.name, estimatedMinutes: null,
    exercises: rows.map(({ measurementType: _type, ...row }) => ({ ...row, restSeconds: row.restSeconds ?? 90 })),
  });
  if (!plan.success || rows.some((r) => r.measurementType && r.measurementType !== "weight_reps")) return null;
  const [checkIn] = await tx.select({ energy: s.dailyCheckIns.energy, soreness: s.dailyCheckIns.soreness,
    limited: s.dailyCheckIns.limited, updatedAt: s.dailyCheckIns.updatedAt,
  }).from(s.dailyCheckIns).where(and(eq(s.dailyCheckIns.userId, userId), eq(s.dailyCheckIns.day, day)));
  const since = new Date(Date.parse(day) - 30 * 86400_000).toISOString().slice(0, 10);
  const readings = await tx.select().from(s.wearableDays).where(and(eq(s.wearableDays.userId, userId),
    gte(s.wearableDays.day, since), lte(s.wearableDays.day, day), lte(s.wearableDays.observedAt, now)))
    .orderBy(asc(s.wearableDays.provider), asc(s.wearableDays.day));
  // Explicit allowlist: provider credentials are never loaded into coach context.
  const connections = await tx.select({ provider: s.wearableConnections.provider, status: s.wearableConnections.status,
    lastSyncAt: s.wearableConnections.lastSyncAt, lastError: s.wearableConnections.lastError,
  }).from(s.wearableConnections).where(eq(s.wearableConnections.userId, userId)).orderBy(asc(s.wearableConnections.provider));
  const readiness = assessReadiness(day, readings, connections, checkIn || null, now);
  const inputs = coachInputsSchema.parse({ day, timezone: user.timezone, templateId, scheduledDay: template.scheduledDay,
    ...(scheduled ? { scheduled } : {}),
    checkIn: checkIn ? { ...checkIn, updatedAt: checkIn.updatedAt.toISOString() } : null,
    readiness: { version: readiness.version, mode: readiness.mode, reasons: readiness.reasons,
      sources: readiness.sources.map((source) => ({ ...source, lastSync: source.lastSync?.toISOString() ?? null })),
    },
  });
  // Include observation revisions, not only their resulting readiness band.
  const inputHash = createHash("sha256").update(JSON.stringify({ policy: COACH_POLICY, inputs, plan: plan.data,
    observations: readings.map(({ userId: _owner, ...reading }) => reading), connections,
  })).digest("hex");
  return { inputs, original: plan.data, inputHash };
}
