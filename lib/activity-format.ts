import type { ActivityStatus, SkillLevel } from "@/types/database";

/** Human label for a skill level. */
export function skillLabel(skill: SkillLevel): string {
  switch (skill) {
    case "all":
      return "All welcome";
    case "casual":
      return "Casual";
    case "competitive":
      return "Competitive";
  }
}

/** Human label for an activity status. Pure — safe to import anywhere. */
export function statusLabel(status: ActivityStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "full":
      return "Full";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Finished";
  }
}
