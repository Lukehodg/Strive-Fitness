export type HealthDay = {
  day: string;
  score: number | null;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
};
type Reading = Omit<HealthDay, "restingHeartRate"> & {
  restingHeartRate?: number | null;
  provider: string;
  observedAt: Date;
  calibrating: boolean;
};
type Connection = {
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  lastError: string | null;
};
export type HealthSource = {
  provider: "whoop" | "oura";
  label: string;
  scoreLabel: string;
  fresh: boolean;
  status: string;
  lastSync: string | null;
  current: HealthDay | null;
  days: HealthDay[];
};
export type HealthOverview = {
  day: string;
  timezone: string;
  sources: HealthSource[];
};
export function buildHealthOverview(
  today: string,
  timezone: string,
  readings: Reading[],
  connections: Connection[],
  now = new Date(),
): HealthOverview {
  const calendar = Array.from({ length: 28 }, (_, i) =>
    new Date(Date.parse(today + "T12:00:00Z") - (27 - i) * 86400_000)
      .toISOString()
      .slice(0, 10),
  );
  const sources: HealthSource[] = [];
  for (const provider of ["whoop", "oura"] as const) {
    const connection = connections.find(
      (c) => c.provider === provider && c.status !== "disconnected",
    );
    if (!connection) continue;
    const valid = readings.filter(
      (r) =>
        r.provider === provider &&
        r.day >= calendar[0] &&
        r.day <= today &&
        r.observedAt <= now &&
        !r.calibrating,
    );
    const days = calendar.map((day) => {
      const row = valid
        .filter((r) => r.day === day)
        .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0];
      return {
        day,
        score: row?.score ?? null,
        sleepMinutes: row?.sleepMinutes ?? null,
        hrv: row?.hrv ?? null,
        restingHeartRate: row?.restingHeartRate ?? null,
      };
    });
    const fresh =
      connection.status === "connected" &&
      !connection.lastError &&
      !!connection.lastSyncAt &&
      connection.lastSyncAt <= now &&
      now.getTime() - connection.lastSyncAt.getTime() <= 12 * 3600_000;
    const current =
      fresh && valid.some((r) => r.day === today) ? days[27] : null;
    sources.push({
      provider,
      label: provider === "whoop" ? "WHOOP" : "Oura",
      scoreLabel: provider === "whoop" ? "Recovery" : "Readiness",
      fresh,
      status: connection.status,
      lastSync: connection.lastSyncAt?.toISOString() ?? null,
      current,
      days,
    });
  }
  return { day: today, timezone, sources };
}
