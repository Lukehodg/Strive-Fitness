import { z } from "zod";

export const coachRequestSchema = z.object({
  requestKey: z.string().uuid(),
  templateId: z.number().int().positive().max(2147483647),
  scheduledId: z.number().int().positive().max(2147483647).optional(),
}).strict();

export const coachExerciseSchema = z.object({
  exerciseId: z.number().int().positive(),
  name: z.string().min(1),
  sets: z.number().int().min(1).max(20),
  repsMin: z.number().int().min(1).max(200),
  repsMax: z.number().int().min(1).max(200),
  restSeconds: z.number().int().min(0).max(1800),
}).refine((v) => v.repsMax >= v.repsMin, "Invalid rep range.");
export const coachPlanSchema = z.object({
  name: z.string().min(1),
  // No duration claim until work, rest, warm-up and transitions can be estimated.
  estimatedMinutes: z.number().positive().nullable(),
  exercises: z.array(coachExerciseSchema).min(1).max(30),
});
export const coachSourceSchema = z.object({
  provider: z.string(), label: z.string(), score: z.number().nullable(),
  sleepMinutes: z.number().nullable(), hrv: z.number().nullable(),
  day: z.string().nullable(), lastSync: z.string().nullable(),
  usable: z.boolean(), historyDays: z.number(), unavailableReason: z.string().nullable(),
});
export const coachInputsSchema = z.object({
  day: z.string().date(), timezone: z.string(), templateId: z.number().int(),
  scheduledDay: z.string().nullable(),
  scheduled: z.object({ id: z.number().int(), day: z.string(), timezone: z.string(), revision: z.number().int(), skipped: z.boolean(), sessionId: z.number().int().nullable() }).nullable().optional(),
  checkIn: z.object({ energy: z.string(), soreness: z.string(), limited: z.boolean(), updatedAt: z.string() }).nullable(),
  readiness: z.object({
    version: z.string(), mode: z.enum(["unknown", "recover", "ease", "steady", "progress"]),
    reasons: z.array(z.string()), sources: z.array(coachSourceSchema),
  }),
});
export const coachSnapshotSchema = z.object({
  policyVersion: z.string(),
  status: z.enum(["ready", "needs_check_in", "blocked"]),
  inputs: coachInputsSchema,
  original: coachPlanSchema,
  proposed: coachPlanSchema.nullable(),
  reasons: z.array(z.object({ code: z.string(), text: z.string() })),
  changes: z.array(z.object({ exerciseId: z.number().int(), field: z.literal("sets"), before: z.number().int(), after: z.number().int() })),
});
export const coachRecommendationSchema = coachSnapshotSchema.extend({
  id: z.number().int(), createdAt: z.string().datetime(), expiresAt: z.string().datetime(),
  stale: z.boolean(), staleReason: z.enum(["expired", "inputs_changed", "template_unavailable"]).nullable(),
  decision: z.object({ id: z.number().int(), choice: z.enum(["proposed", "original"]), sessionId: z.number().int().nullable() }).nullable().default(null),
});
export const coachDecisionRequestSchema = z.object({ choice: z.enum(["proposed", "original"]) }).strict();
export const coachTodaySchema = z.object({
  day: z.string().date(), timezone: z.string(),
  templates: z.array(z.object({ id: z.number().int(), name: z.string(), scheduledDay: z.string().nullable() })),
  scheduledTemplateIds: z.array(z.number().int()),
  scheduledWorkouts: z.array(z.object({ id: z.number().int(), templateId: z.number().int(), name: z.string(), sessionId: z.number().int().nullable() })).default([]),
  activeSessions: z.array(z.object({ id: z.number().int(), templateId: z.number().int() })),
  recommendation: coachRecommendationSchema.nullable(),
});
export type CoachInputs = z.infer<typeof coachInputsSchema>;
export type CoachPlan = z.infer<typeof coachPlanSchema>;
export type CoachSnapshot = z.infer<typeof coachSnapshotSchema>;
export type CoachRecommendation = z.infer<typeof coachRecommendationSchema>;
export type CoachToday = z.infer<typeof coachTodaySchema>;
