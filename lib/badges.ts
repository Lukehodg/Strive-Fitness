import { Ionicons } from "@expo/vector-icons";

import type { PlayerStats } from "@/types/database";

type IconName = keyof typeof Ionicons.glyphMap;

export type Badge = {
  id: string;
  label: string;
  icon: IconName;
  earned: boolean;
};

/**
 * Achievement definitions, in display order. All derived from player_stats —
 * nothing is stored, so badges are always consistent with reality (and history
 * counts retroactively the moment this ships).
 */
const DEFS: { id: string; label: string; icon: IconName; test: (s: PlayerStats) => boolean }[] = [
  { id: "first-game", label: "First game", icon: "footsteps", test: (s) => s.games_played >= 1 },
  { id: "regular", label: "Regular", icon: "repeat", test: (s) => s.games_played >= 10 },
  { id: "veteran", label: "Veteran", icon: "medal", test: (s) => s.games_played >= 25 },
  { id: "half-century", label: "Half century", icon: "trophy", test: (s) => s.games_played >= 50 },
  { id: "host", label: "Host", icon: "home", test: (s) => s.games_hosted >= 1 },
  { id: "captain", label: "Captain", icon: "ribbon", test: (s) => s.games_hosted >= 5 },
  { id: "gaffer", label: "Gaffer", icon: "star", test: (s) => s.games_hosted >= 15 },
  { id: "all-rounder", label: "All-rounder", icon: "apps", test: (s) => s.sports_count >= 3 },
  { id: "cross-trainer", label: "Cross-trainer", icon: "infinite", test: (s) => s.sports_count >= 5 },
  { id: "back-to-back", label: "Back-to-back", icon: "flame", test: (s) => s.current_streak_weeks >= 2 },
  { id: "on-fire", label: "On fire", icon: "flame", test: (s) => s.current_streak_weeks >= 4 },
  { id: "unstoppable", label: "Unstoppable", icon: "flash", test: (s) => s.current_streak_weeks >= 8 },
  { id: "machine", label: "Machine", icon: "barbell", test: (s) => s.games_this_month >= 8 },
];

export function computeBadges(stats: PlayerStats): Badge[] {
  return DEFS.map((d) => ({ id: d.id, label: d.label, icon: d.icon, earned: d.test(stats) }));
}

export function earnedBadges(stats: PlayerStats): Badge[] {
  return computeBadges(stats).filter((b) => b.earned);
}

/** The first unearned badge — the "next up" motivator on your own profile. */
export function nextBadge(stats: PlayerStats): Badge | null {
  return computeBadges(stats).find((b) => !b.earned) ?? null;
}
