export type PlanExercise = {
  exerciseId: number;
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
};
export type WorkoutSession = {
  id: number;
  workoutTemplateId: number;
  startTime: string;
  endTime: string | null;
  isCompleted: boolean;
  planSnapshot: {
    name: string;
    exercises: PlanExercise[];
    coach?: { recommendationId: number; decisionId: number; choice: "proposed" | "original"; reasons: string[] };
    guidance?: {
      version: string;
      assessedAt: string;
      mode: string;
      reasons: string[];
    };
  } | null;
};
export type LoggedSet = {
  id: number;
  exerciseId: number;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  timestamp: string;
};
export type ExercisePerformance = {
  exerciseId: number; name: string; heaviest: number; bestSetVolume: number;
  bestReps: number; sessionCount: number;
  previous: { weight: number; reps: number; finishedAt: string; setNumber: number }[];
};
export type SessionDetail = { workout: WorkoutSession; sets: LoggedSet[];
  performance: ExercisePerformance[];
  achievements: {exerciseId: number; name: string; achievements: string[]}[];
};
