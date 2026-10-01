import { z } from "zod";
export const calendarDate = z.string().date();
export const scheduleBuildSchema = z.object({ start: calendarDate, weeks: z.number().int().min(1).max(4).default(4) }).strict();
export const scheduleEditSchema = z.object({ revision: z.number().int().nonnegative(), day: calendarDate.optional(), skipped: z.boolean().optional() }).strict()
  .refine(v => v.day !== undefined || v.skipped !== undefined, "Choose a date or skip state.");
export const sessionFeedbackSchema = z.object({
  difficulty: z.enum(["too_easy", "about_right", "too_hard"]),
  energyAfter: z.enum(["better", "same", "worse"]).nullable().default(null),
  note: z.string().trim().max(1000).default(""),
}).strict();
export type SessionFeedback = z.infer<typeof sessionFeedbackSchema>;
export type ScheduledWorkout = { id: number; templateId: number; name: string; day: string; timezone: string;
  revision: number; status: "planned" | "skipped" | "in_progress" | "completed" | "missed";
  sessionId: number | null };
export type TrainingWeek = { start: string; end: string; today: string; timezone: string; workouts: ScheduledWorkout[] };
