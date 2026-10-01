import { and, eq, asc } from "drizzle-orm";
import { db } from "./db";
import * as s from "../shared/schema";

export type PerformanceSet = {
  exerciseId: number; name: string; sessionId: number; setNumber: number;
  weight: number; reps: number; finishedAt: string;
};

// Only persisted, completed sets from completed sessions enter the record book.
export async function completedPerformance(userId: number) {
  const rows = await db.select({ set: s.workoutSets, workout: s.completedWorkouts, name: s.exercises.name })
    .from(s.completedWorkouts)
    .innerJoin(s.workoutSets, eq(s.workoutSets.completedWorkoutId, s.completedWorkouts.id))
    .innerJoin(s.exercises, eq(s.exercises.id, s.workoutSets.exerciseId))
    .where(and(eq(s.completedWorkouts.userId, userId), eq(s.completedWorkouts.isCompleted, true), eq(s.workoutSets.isCompleted, true)))
    .orderBy(asc(s.completedWorkouts.endTime), asc(s.completedWorkouts.id), asc(s.workoutSets.setNumber));
  return rows.flatMap(({ set, workout, name }): PerformanceSet[] =>
    workout.endTime && set.weight !== null && set.weight >= 0 && set.reps !== null && set.reps > 0
      ? [{ exerciseId: set.exerciseId, name, sessionId: workout.id, setNumber: set.setNumber,
          weight: set.weight, reps: set.reps, finishedAt: workout.endTime.toISOString() }] : []);
}

export function summarizePerformance(rows: PerformanceSet[]) {
  const groups = new Map<number, PerformanceSet[]>();
  for (const row of rows) {
    if (!groups.has(row.exerciseId)) groups.set(row.exerciseId, []);
    groups.get(row.exerciseId)!.push(row);
  }
  return [...groups.entries()].map(([exerciseId, sets]) => {
    const last = sets[sets.length - 1];
    return {
      exerciseId, name: last.name,
      heaviest: Math.max(...sets.map(s => s.weight)),
      bestSetVolume: Math.max(...sets.map(s => s.weight * s.reps)),
      bestReps: Math.max(...sets.filter(s => s.weight === 0).map(s => s.reps), 0),
      sessionCount: new Set(sets.map(s => s.sessionId)).size,
      previous: sets.filter(s => s.sessionId === last.sessionId),
    };
  });
}

export function sessionAchievements(prior: PerformanceSet[], current: PerformanceSet[]) {
  const before = summarizePerformance(prior);
  return summarizePerformance(current).map(record => {
    const old = before.find(r => r.exerciseId === record.exerciseId);
    const achievements: string[] = [];
    if (!old) achievements.push("First session · baseline established");
    else {
      if (record.heaviest > old.heaviest) achievements.push(`Heaviest load PR · ${record.heaviest} kg`);
      if (record.bestSetVolume > old.bestSetVolume) achievements.push(`Best set volume PR · ${record.bestSetVolume} kg × reps`);
      if (record.bestReps > old.bestReps) achievements.push(`Bodyweight reps PR · ${record.bestReps} reps`);
    }
    return { exerciseId: record.exerciseId, name: record.name, achievements };
  });
}
