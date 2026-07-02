import { computeBadges, earnedBadges, nextBadge } from "@/lib/badges";
import type { PlayerStats } from "@/types/database";

const zero: PlayerStats = {
  games_played: 0,
  games_hosted: 0,
  games_this_month: 0,
  sports_count: 0,
  top_sport: null,
  top_sport_count: 0,
  last_played_at: null,
  current_streak_weeks: 0,
};

describe("badges", () => {
  it("earns nothing at zero and offers First game as next", () => {
    expect(earnedBadges(zero)).toHaveLength(0);
    expect(nextBadge(zero)?.id).toBe("first-game");
  });

  it("earns play-count badges at their thresholds", () => {
    const ids = earnedBadges({ ...zero, games_played: 25 }).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["first-game", "regular", "veteran"]));
    expect(ids).not.toContain("half-century");
  });

  it("earns hosting and streak badges independently", () => {
    const ids = earnedBadges({
      ...zero,
      games_hosted: 5,
      current_streak_weeks: 4,
    }).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["host", "captain", "back-to-back", "on-fire"]));
    expect(ids).not.toContain("gaffer");
    expect(ids).not.toContain("unstoppable");
  });

  it("computeBadges returns every definition with an earned flag", () => {
    const all = computeBadges({ ...zero, games_played: 100, games_hosted: 20, sports_count: 7, games_this_month: 10, current_streak_weeks: 10 });
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(all.every((b) => b.earned)).toBe(true);
  });
});
