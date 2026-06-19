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
