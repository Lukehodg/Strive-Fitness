import type { Express } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import * as s from "../shared/schema";
import { asyncHandler } from "./auth";
export function registerRoutines(app: Express) {
  app.get(
    "/api/routine-logs",
    asyncHandler(async (req, res) =>
      res.json(
        await db
          .select()
          .from(s.routineLogs)
          .where(eq(s.routineLogs.userId, req.account.id))
          .orderBy(desc(s.routineLogs.recordedAt))
          .limit(100),
      ),
    ),
  );
  app.post(
    "/api/routine-logs",
    asyncHandler(async (req, res) => {
      const input = z
        .object({
          medicationId: z.number().int().positive(),
          status: z.enum(["taken", "skipped"]),
          requestKey: z.string().uuid(),
        })
        .strict()
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        await tx
          .select({ id: s.users.id })
          .from(s.users)
          .where(eq(s.users.id, req.account.id))
          .for("update");
        const [existing] = await tx
          .select()
          .from(s.routineLogs)
          .where(
            and(
              eq(s.routineLogs.userId, req.account.id),
              eq(s.routineLogs.requestKey, input.requestKey),
            ),
          );
        if (existing) {
          if (
            existing.medicationId !== input.medicationId ||
            existing.status !== input.status
          )
            throw Object.assign(
              new Error(
                "This action was already recorded. Refresh before trying again.",
              ),
              { status: 409 },
            );
          return existing;
        }
        const [medication] = await tx
          .select()
          .from(s.medications)
          .where(
            and(
              eq(s.medications.id, input.medicationId),
              eq(s.medications.userId, req.account.id),
            ),
          )
          .for("update");
        if (!medication)
          throw Object.assign(new Error("Routine not found."), { status: 404 });
        if (!medication.isActive)
          throw Object.assign(new Error("This routine is archived."), {
            status: 409,
          });
        const [log] = await tx
          .insert(s.routineLogs)
          .values({
            ...input,
            userId: req.account.id,
            name: medication.name,
            dosage: medication.dosage,
          })
          .returning();
        return log;
      });
      res.status(201).json(result);
    }),
  );
}
