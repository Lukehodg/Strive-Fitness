import { coachSnapshotSchema, type CoachInputs, type CoachPlan, type CoachSnapshot } from "../../shared/coach";

export const COACH_POLICY = "coach-preview-v1";

export function planWorkout(inputs: CoachInputs, original: CoachPlan): CoachSnapshot {
  const unavailableSchedule = !!inputs.scheduled && (inputs.scheduled.skipped || inputs.scheduled.sessionId !== null || inputs.scheduled.day !== inputs.day || inputs.scheduled.timezone !== inputs.timezone);
  const blocked = inputs.checkIn?.limited === true || unavailableSchedule;
  const status = blocked ? "blocked" : !inputs.checkIn ? "needs_check_in" : "ready";
  const changes: CoachSnapshot["changes"] = [];
  const proposed = status === "ready" ? {
    ...original,
    exercises: original.exercises.map((exercise) => {
      const sets = inputs.readiness.mode === "ease" ? Math.max(1, Math.floor(exercise.sets * 0.75)) : exercise.sets;
      if (sets !== exercise.sets) changes.push({ exerciseId: exercise.exerciseId, field: "sets", before: exercise.sets, after: sets });
      return { ...exercise, sets };
    }),
  } : null;
  const reason = unavailableSchedule
    ? { code: "schedule_unavailable", text: "This scheduled workout is not available for today. Review its date, timezone and session status in Your plan." }
    : blocked
    ? { code: "limitation_reported", text: "Your check-in reports limiting illness, pain or injury. No workout is proposed." }
    : status === "needs_check_in"
      ? { code: "check_in_required", text: "Save today's check-in before reviewing a workout proposal." }
      : changes.length
        ? { code: "fewer_sets", text: "Use 75% of each exercise's working sets, rounded down with a minimum of one. Rep and rest targets stay unchanged." }
        : { code: "keep_targets", text: "Keep the original set, rep and rest targets. No extra load or intensity is prescribed." };
  return coachSnapshotSchema.parse({
    policyVersion: COACH_POLICY, status, inputs, original, proposed, changes,
    reasons: [reason, ...inputs.readiness.reasons.map((text) => ({ code: "readiness_context", text }))],
  });
}
