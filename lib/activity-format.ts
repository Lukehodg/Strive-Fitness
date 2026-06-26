import type { ActivityStatus } from "@/types/database";

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
