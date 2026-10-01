import type { db } from "./db";
import { completedWorkouts } from "../shared/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Plan = NonNullable<typeof completedWorkouts.$inferSelect.planSnapshot>;

// Callers hold the account lock and validate eligibility before creating a session.
export async function createSavedSession(tx: Transaction, userId: number, templateId: number, planSnapshot: Plan) {
  const [session] = await tx.insert(completedWorkouts).values({
    userId, workoutTemplateId: templateId, startTime: new Date(), isCompleted: false, planSnapshot,
  }).returning();
  return session;
}
