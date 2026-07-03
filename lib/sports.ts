import { Ionicons } from "@expo/vector-icons";

import type { ActivityType } from "@/types/database";

/** The sports the app surfaces (a subset of the broader `activity_type` enum). */
export type Sport =
  | "football"
  | "running"
  | "cycling"
  | "gym"
  | "tennis"
  | "padel"
  | "basketball";

type IconName = keyof typeof Ionicons.glyphMap;

/** Display order for filters + the Create picker. */
export const SPORTS: Sport[] = [
  "football",
  "running",
  "cycling",
  "gym",
  "tennis",
  "padel",
  "basketball",
];

type SportMeta = {
  label: string;
  icon: IconName;
  /** Map-pin / accent colour. */
  color: string;
};

export const SPORT_META: Record<Sport, SportMeta> = {
  football: { label: "Football", icon: "football", color: "#B87A0D" },
  running: { label: "Running", icon: "walk", color: "#1E5A44" },
  cycling: { label: "Cycling", icon: "bicycle", color: "#2D6CDF" },
  gym: { label: "Gym", icon: "barbell", color: "#7A3BB2" },
  tennis: { label: "Tennis", icon: "tennisball", color: "#5C8A1B" },
  padel: { label: "Padel", icon: "tennisball", color: "#0E8C8C" },
  basketball: { label: "Basketball", icon: "basketball", color: "#C2410C" },
};

/** Sensible starting values in Create, per sport. */
export const SPORT_DEFAULTS: Record<
  Sport,
  { maxPlayers: number; durationMinutes: number; titlePlaceholder: string }
> = {
  football: { maxPlayers: 10, durationMinutes: 60, titlePlaceholder: "Sunday 5-a-side" },
  running: { maxPlayers: 15, durationMinutes: 45, titlePlaceholder: "Riverside easy 5K" },
  cycling: { maxPlayers: 12, durationMinutes: 120, titlePlaceholder: "Surrey Hills loop" },
  gym: { maxPlayers: 6, durationMinutes: 75, titlePlaceholder: "Push day + spot" },
  tennis: { maxPlayers: 4, durationMinutes: 90, titlePlaceholder: "Doubles, anyone?" },
  padel: { maxPlayers: 4, durationMinutes: 90, titlePlaceholder: "Padel social" },
  basketball: { maxPlayers: 10, durationMinutes: 90, titlePlaceholder: "Pickup hoops" },
};

const META = SPORT_META as Record<string, SportMeta>;
const DEFAULTS = SPORT_DEFAULTS as Record<
  string,
  { maxPlayers: number; durationMinutes: number; titlePlaceholder: string }
>;

export function sportLabel(type: ActivityType): string {
  return META[type]?.label ?? "Activity";
}

export function sportIcon(type: ActivityType): IconName {
  return META[type]?.icon ?? "ellipse";
}

export function sportColor(type: ActivityType): string {
  return META[type]?.color ?? "#8A847A";
}

export function sportDefaults(type: ActivityType) {
  return (
    DEFAULTS[type] ?? { maxPlayers: 10, durationMinutes: 60, titlePlaceholder: "Activity name" }
  );
}

/**
 * The natural noun for a single occurrence of each sport — so the UI can say
 * "Leave run" / "Cancel ride" / "Join match" instead of a blanket "game".
 */
const NOUNS: Record<string, string> = {
  football: "game",
  running: "run",
  cycling: "ride",
  gym: "session",
  tennis: "match",
  padel: "match",
  basketball: "game",
};

export function activityNoun(type: ActivityType): string {
  return NOUNS[type] ?? "activity";
}

/** Football is the only sport with a team format + skill level. */
export function isFootball(type: ActivityType): boolean {
  return type === "football";
}

/** Sports where a final score makes sense (hosts can record a result). */
export function sportHasScore(type: ActivityType): boolean {
  return type === "football" || type === "basketball" || type === "tennis" || type === "padel";
}
