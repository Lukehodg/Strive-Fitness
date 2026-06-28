import {
  formatStravaDistance,
  formatStravaDuration,
  formatStravaEffort,
  stravaSportLabel,
} from "@/lib/strava";
import type { StravaActivity } from "@/types/database";

const base: StravaActivity = {
  id: 1,
  user_id: "u1",
  name: "Morning run",
  sport_type: "Run",
  distance_m: null,
  moving_time_s: null,
  elapsed_time_s: null,
  total_elevation_gain: null,
  average_speed: null,
  start_date: null,
  created_at: "2026-06-01T08:00:00Z",
};

describe("strava formatters", () => {
  it("formats distance in km", () => {
    expect(formatStravaDistance(5234)).toBe("5.2 km");
    expect(formatStravaDistance(0)).toBe("—");
    expect(formatStravaDistance(null)).toBe("—");
  });

  it("formats duration as m:ss and h:mm:ss", () => {
    expect(formatStravaDuration(2910)).toBe("48:30");
    expect(formatStravaDuration(3912)).toBe("1:05:12");
    expect(formatStravaDuration(null)).toBe("—");
  });

  it("shows pace for foot sports and speed for rides", () => {
    expect(formatStravaEffort({ ...base, sport_type: "Run", average_speed: 3 })).toBe("5:33 /km");
    expect(formatStravaEffort({ ...base, sport_type: "Ride", average_speed: 8 })).toBe("28.8 km/h");
    expect(formatStravaEffort({ ...base, average_speed: null })).toBeNull();
  });

  it("humanises sport labels", () => {
    expect(stravaSportLabel("MountainBikeRide")).toBe("Mountain Bike Ride");
    expect(stravaSportLabel(null)).toBe("Activity");
  });
});
