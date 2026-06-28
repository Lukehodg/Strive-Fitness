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

export const SPORT_META: Record<Sport, { label: string; icon: IconName }> = {
  football: { label: "Football", icon: "football" },
  running: { label: "Running", icon: "walk" },
  cycling: { label: "Cycling", icon: "bicycle" },
  gym: { label: "Gym", icon: "barbell" },
  tennis: { label: "Tennis", icon: "tennisball" },
  padel: { label: "Padel", icon: "tennisball" },
  basketball: { label: "Basketball", icon: "basketball" },
};

const META = SPORT_META as Record<string, { label: string; icon: IconName }>;

export function sportLabel(type: ActivityType): string {
  return META[type]?.label ?? "Activity";
}

export function sportIcon(type: ActivityType): IconName {
  return META[type]?.icon ?? "ellipse";
}

/** Football is the only sport with a team format + skill level. */
export function isFootball(type: ActivityType): boolean {
  return type === "football";
}
