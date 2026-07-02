import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { LeaderboardRow, PlayerStats, Profile } from "@/types/database";

/** The readable subset of another user's profile (see 0013 column grants). */
export type PublicProfile = Pick<
  Profile,
  "id" | "display_name" | "avatar_url" | "area_label" | "bio" | "created_at"
>;

/** Another user's public profile basics. */
export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-profile", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<PublicProfile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, area_label, bio, created_at")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * A player's stats. Server-gated: returns a row only for yourself or a
 * connection — `null` here means "locked" (not connected), which the UI turns
 * into a play-together nudge.
 */
export function usePlayerStats(userId: string | undefined) {
  return useQuery({
    queryKey: ["player-stats", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<PlayerStats | null> => {
      const { data, error } = await supabase.rpc("player_stats", { target: userId! });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

/** You + your connections, ranked by games in the last 30 days. */
export function useConnectionsLeaderboard() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["leaderboard", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc("connections_leaderboard");
      if (error) throw error;
      return data ?? [];
    },
  });
}
