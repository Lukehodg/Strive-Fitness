import { Ionicons } from "@expo/vector-icons";

import type { StravaActivity } from "@/types/database";

type IconName = keyof typeof Ionicons.glyphMap;

/** Strava OAuth endpoints for expo-auth-session. */
export const STRAVA_DISCOVERY = {
  authorizationEndpoint: "https://www.strava.com/oauth/authorize",
  tokenEndpoint: "https://www.strava.com/oauth/token",
};

// Comma-separated per Strava (a single scope token avoids expo joining with
// spaces, which Strava rejects). `read` + `activity:read` = their non-private
// activities; broaden to `activity:read_all` later if you want private ones.
export const STRAVA_SCOPES = ["read,activity:read"];

// Strava's brand brown — required alongside the "Powered by Strava" mark.
export const STRAVA_ORANGE = "#FC4C02";

/** Map a Strava sport_type to one of our icons. */
export function stravaSportIcon(sport: string | null): IconName {
  switch (sport) {
    case "Run":
    case "TrailRun":
    case "VirtualRun":
      return "walk";
    case "Ride":
    case "VirtualRide":
    case "MountainBikeRide":
    case "GravelRide":
    case "EBikeRide":
      return "bicycle";
    case "Swim":
      return "water";
    case "Walk":
    case "Hike":
      return "walk";
    case "WeightTraining":
    case "Workout":
    case "Crossfit":
      return "barbell";
    case "Yoga":
      return "body";
    default:
      return "fitness";
  }
}

/** Human label for a Strava sport_type ("MountainBikeRide" -> "Mountain Bike Ride"). */
export function stravaSportLabel(sport: string | null): string {
  if (!sport) return "Activity";
  return sport.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatStravaDistance(meters: number | null): string {
  if (!meters) return "—";
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatStravaDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * A short "pace or speed" string from average_speed (m/s): min/km for foot
 * sports, km/h for wheels. Returns null when we can't compute it.
 */
export function formatStravaEffort(a: StravaActivity): string | null {
  if (!a.average_speed || a.average_speed <= 0) return null;
  const wheels = a.sport_type?.includes("Ride") ?? false;
  if (wheels) {
    return `${(a.average_speed * 3.6).toFixed(1)} km/h`;
  }
  const secPerKm = 1000 / a.average_speed;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}
