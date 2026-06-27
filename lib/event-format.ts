import type { EventType } from "@/types/database";

/** Short uppercase label for an event type (used in mono tags). */
export function eventTypeLabel(type: EventType): string {
  switch (type) {
    case "parkrun":
      return "PARKRUN";
    case "5k":
      return "5K";
    case "10k":
      return "10K";
    case "half_marathon":
      return "HALF MARATHON";
    case "marathon":
      return "MARATHON";
    case "hyrox":
      return "HYROX";
    case "other":
      return "EVENT";
  }
}
