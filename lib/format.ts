/** Small, pure formatting helpers used across screens. */

/** Approximate distance label. We never show exact coordinates — distance only. */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    const rounded = Math.round(meters / 50) * 50;
    return `${Math.max(rounded, 50)} m away`;
  }
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km away`;
}

/** "Today 18:30", "Tomorrow 09:00", or "Sat 21 Jun, 18:30". */
export function formatStartTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;

  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${day}, ${time}`;
}

/** "5 / 10 going" style label. */
export function formatRoster(joined: number, max: number): string {
  return `${joined} / ${max} going`;
}

/**
 * Fixture-rail day label: "TODAY", "TMRW", then the weekday ("SAT").
 * Pairs with formatClock — together they lead every fixture card.
 */
export function formatDayShort(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round(
    (startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
  if (dayDiff === 0) return "TODAY";
  if (dayDiff === 1) return "TMRW";
  return date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
}

/** Fixture-rail kickoff clock: "18:30". */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Build a Date n days from today at "HH:MM", or null if the time is invalid. */
export function dateFromDayOffset(dayOffset: number, time: string): Date | null {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Day-picker chip label: "Today", "Tomorrow", then the real weekday ("Wed"). */
export function formatDayChip(dayOffset: number): string {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

/** "Starts in 3h" / "In progress" / "Finished" relative to now. */
export function formatCountdown(startsAt: string, durationMinutes: number): string {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  const now = Date.now();
  if (now >= end) return "Finished";
  if (now >= start) return "In progress";

  const mins = Math.round((start - now) / 60_000);
  if (mins < 60) return `Starts in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `Starts in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `Starts in ${days} day${days === 1 ? "" : "s"}`;
}
