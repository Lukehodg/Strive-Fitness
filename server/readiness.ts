import type { Express } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { buildHealthOverview } from "../shared/health-overview";
import { db } from "./db";
import {
  dailyCheckIns,
  wearableConnections,
  wearableDays,
} from "../shared/schema";
import { asyncHandler } from "./auth";

type Reading = typeof wearableDays.$inferSelect;
type Connection = Pick<
  typeof wearableConnections.$inferSelect,
  "provider" | "status" | "lastSyncAt" | "lastError"
>;
type CheckIn = Pick<
  typeof dailyCheckIns.$inferSelect,
  "limited" | "energy" | "soreness"
> | null;
export function assessReadiness(
  today: string,
  readings: Reading[],
  connections: Connection[],
  checkIn: CheckIn,
  now = new Date(),
) {
  const sources = connections
    .filter((c) => c.status !== "disconnected")
    .map((connection) => {
      const reading = readings.find(
        (r) => r.provider === connection.provider && r.day === today,
      );
      const historyDays = new Set(
        readings
          .filter(
            (r) =>
              r.provider === connection.provider &&
              r.day < today &&
              r.score !== null &&
              !r.calibrating,
          )
          .map((r) => r.day),
      ).size;
      const fresh =
        connection.status === "connected" &&
        !connection.lastError &&
        !!connection.lastSyncAt &&
        connection.lastSyncAt.getTime() <= now.getTime() &&
        now.getTime() - connection.lastSyncAt.getTime() <= 12 * 3600_000;
      const usable =
        fresh &&
        !!reading &&
        !reading.calibrating &&
        reading.score !== null &&
        reading.observedAt <= now;
      return {
        provider: connection.provider,
        label:
          connection.provider === "whoop" ? "WHOOP recovery" : "Oura readiness",
        score: reading?.score ?? null,
        sleepMinutes: reading?.sleepMinutes ?? null,
        hrv: reading?.hrv ?? null,
        day: reading?.day ?? null,
        lastSync: connection.lastSyncAt,
        usable,
        historyDays,
        unavailableReason: !fresh
          ? "Sync needs updating"
          : !reading
            ? "No reading for today"
            : reading.calibrating
              ? "Device is calibrating"
              : !usable
                ? "Today's score is not available"
                : null,
      };
    });
  const usable = sources.filter((s) => s.usable);
  const reasons: string[] = [];
  let mode: "unknown" | "recover" | "ease" | "steady" | "progress" = "unknown";
  if (checkIn?.limited) {
    mode = "recover";
    reasons.push(
      "Your check-in says illness, pain or injury is limiting you. Do not use a wearable score to override that.",
    );
  } else if (checkIn?.energy === "low" || checkIn?.soreness === "high") {
    mode = "ease";
    reasons.push("Your check-in suggests keeping today's session lighter.");
  } else if (
    usable.some((s) => s.score! < (s.provider === "whoop" ? 34 : 70))
  ) {
    mode = "ease";
    reasons.push(
      "At least one device reports a lower recovery/readiness band today.",
    );
  } else if (usable.length) {
    mode = "steady";
    const allHigh =
      usable.length === sources.length &&
      usable.every((s) => s.score! >= (s.provider === "whoop" ? 67 : 85));
    if (
      allHigh &&
      usable.every((s) => s.historyDays >= 7) &&
      checkIn &&
      checkIn.soreness === "none"
    ) {
      mode = "progress";
      reasons.push(
        "Today's device scores and your check-in support working toward the upper end of your planned rep range.",
      );
    } else
      reasons.push(
        "Keep your planned targets and reassess how the warm-up feels.",
      );
    if (!checkIn)
      reasons.push(
        "Save today's check-in before considering a harder session.",
      );
    if (usable.some((s) => s.historyDays < 7))
      reasons.push(
        "Strive requires seven prior scored days before suggesting progression.",
      );
  } else
    reasons.push(
      "No current, usable device score is available. Strive cannot judge recovery from missing or stale data.",
    );
  if (sources.length > 1)
    reasons.push(
      "Devices are considered separately; the more cautious signal takes priority.",
    );
  for (const source of sources)
    if (source.unavailableReason)
      reasons.push(
        `${source.label}: ${source.unavailableReason.toLowerCase()}.`,
      );
  const title = {
    unknown: "Make today's check-in count.",
    recover: "Give recovery priority.",
    ease: "Keep today lighter.",
    steady: "Stay with your plan.",
    progress: "Room to progress within your plan.",
  }[mode];
  return {
    version: "readiness-v1",
    day: today,
    assessedAt: now.toISOString(),
    mode,
    title,
    reasons,
    sources,
    canReduceSets: mode === "ease",
    note: "Training guidance, not a medical assessment. Medication and supplement doses are never adjusted.",
  };
}
export async function getReadiness(userId: number, timezone: string) {
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const since = new Date(now.getTime() - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const readings = await db
    .select()
    .from(wearableDays)
    .where(and(eq(wearableDays.userId, userId), gte(wearableDays.day, since)));
  const connections = await db
    .select()
    .from(wearableConnections)
    .where(eq(wearableConnections.userId, userId));
  const [checkIn] = await db
    .select()
    .from(dailyCheckIns)
    .where(and(eq(dailyCheckIns.userId, userId), eq(dailyCheckIns.day, today)));
  return assessReadiness(today, readings, connections, checkIn || null, now);
}
export function registerReadiness(app: Express) {
  app.get(
    "/api/health-overview",
    asyncHandler(async (req, res) => {
      const now = new Date();
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: req.account.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const since = new Date(Date.parse(today + "T12:00:00Z") - 27 * 86400_000)
        .toISOString()
        .slice(0, 10);
      const [readings, connections] = await Promise.all([
        db
          .select()
          .from(wearableDays)
          .where(
            and(
              eq(wearableDays.userId, req.account.id),
              gte(wearableDays.day, since),
              lte(wearableDays.day, today),
              lte(wearableDays.observedAt, now),
            ),
          ),
        db
          .select({
            provider: wearableConnections.provider,
            status: wearableConnections.status,
            lastSyncAt: wearableConnections.lastSyncAt,
            lastError: wearableConnections.lastError,
          })
          .from(wearableConnections)
          .where(eq(wearableConnections.userId, req.account.id)),
      ]);
      res.setHeader("Cache-Control", "no-store");
      res.json(
        buildHealthOverview(
          today,
          req.account.timezone,
          readings,
          connections,
          now,
        ),
      );
    }),
  );
  app.get(
    "/api/readiness",
    asyncHandler(async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json(await getReadiness(req.account.id, req.account.timezone));
    }),
  );
}
