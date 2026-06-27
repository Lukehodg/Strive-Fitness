import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, toPoint } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Activity } from "@/types/database";

export type RosterEntry = {
  user_id: string;
  status: "joined" | "left";
  joined_at: string;
  display_name: string;
  avatar_url: string | null;
  area_label: string | null;
};

export type ActivityDetail = Activity & {
  host_name: string;
  joined_count: number;
};

/** Single game with host name + live joined count. */
export function useActivity(activityId: string) {
  return useQuery({
    queryKey: queryKeys.activity(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<ActivityDetail | null> => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, host:profiles!activities_host_id_fkey(display_name)")
        .eq("id", activityId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { count } = await supabase
        .from("activity_participants")
        .select("*", { count: "exact", head: true })
        .eq("activity_id", activityId)
        .eq("status", "joined");

      // host is joined via the embedded relation. Cast through unknown because
      // the placeholder DB types don't declare relationships (regenerate with
      // `npm run gen:types` to get proper embed typing).
      const { host, ...activity } = data as unknown as Activity & {
        host: { display_name: string } | null;
      };
      return {
        ...(activity as Activity),
        host_name: host?.display_name ?? "Host",
        joined_count: count ?? 0,
      };
    },
  });
}

/** The roster (joined players) for a game, with profile basics. */
export function useRoster(activityId: string) {
  return useQuery({
    queryKey: queryKeys.roster(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data, error } = await supabase
        .from("activity_participants")
        .select(
          "user_id, status, joined_at, profile:profiles!activity_participants_user_id_fkey(display_name, avatar_url, area_label)",
        )
        .eq("activity_id", activityId)
        .eq("status", "joined")
        .order("joined_at", { ascending: true });
      if (error) throw error;

      type Row = {
        user_id: string;
        status: "joined" | "left";
        joined_at: string;
        profile: { display_name: string; avatar_url: string | null; area_label: string | null } | null;
      };
      return (data as unknown as Row[]).map((r) => ({
        user_id: r.user_id,
        status: r.status,
        joined_at: r.joined_at,
        display_name: r.profile?.display_name ?? "Player",
        avatar_url: r.profile?.avatar_url ?? null,
        area_label: r.profile?.area_label ?? null,
      }));
    },
  });
}

function invalidateActivity(
  qc: ReturnType<typeof useQueryClient>,
  activityId: string,
  userId?: string,
) {
  qc.invalidateQueries({ queryKey: queryKeys.activity(activityId) });
  qc.invalidateQueries({ queryKey: queryKeys.roster(activityId) });
  qc.invalidateQueries({ queryKey: ["nearby"] });
  if (userId) qc.invalidateQueries({ queryKey: queryKeys.myGames(userId) });
}

/** Join a game. RLS enforces phone verification + block rules server-side. */
export function useJoinActivity(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("activity_participants")
        .upsert({ activity_id: activityId, user_id: user.id, status: "joined" });
      if (error) {
        // RLS denial on insert surfaces as a row-level violation — translate it.
        if (error.code === "42501" || error.message.includes("row-level security")) {
          throw new Error(
            "You need to verify your phone number before joining games.",
          );
        }
        throw error;
      }
    },
    onSuccess: () => invalidateActivity(qc, activityId, user?.id),
  });
}

/** Leave a game (marks the row 'left'; the fullness trigger reopens it). */
export function useLeaveActivity(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("activity_participants")
        .update({ status: "left" })
        .eq("activity_id", activityId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateActivity(qc, activityId, user?.id),
  });
}

/** Cancel a game (host only). Sets status to 'cancelled'; RLS enforces ownership. */
export function useCancelActivity(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("activities")
        .update({ status: "cancelled" })
        .eq("id", activityId)
        .eq("host_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateActivity(qc, activityId, user?.id),
  });
}

export type CreateActivityInput = {
  title: string;
  venue_label: string;
  location: { latitude: number; longitude: number };
  starts_at: string; // ISO
  duration_minutes: number;
  max_players: number;
  notes?: string;
  /** How many weekly occurrences to create (1 = one-off). */
  repeat_weeks?: number;
};

/**
 * Create a football game (RLS requires the host to be phone-verified). When
 * `repeat_weeks > 1`, creates that many weekly fixtures at once and returns the
 * first (this week's). Each occurrence is a normal, independently-joinable game.
 */
export function useCreateActivity() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActivityInput): Promise<Activity> => {
      if (!user) throw new Error("Not signed in");
      const { location, repeat_weeks, ...rest } = input;
      const weeks = Math.max(1, Math.min(12, repeat_weeks ?? 1));
      const point = toPoint(location.longitude, location.latitude);
      const baseStart = new Date(rest.starts_at).getTime();

      const rows = Array.from({ length: weeks }, (_, i) => ({
        host_id: user.id,
        activity_type: "football" as const,
        ...rest,
        starts_at: new Date(baseStart + i * 7 * 86_400_000).toISOString(),
        location: point,
      }));

      const { data, error } = await supabase.from("activities").insert(rows).select("*");
      if (error) {
        if (error.code === "42501" || error.message.includes("row-level security")) {
          throw new Error("Verify your phone number before hosting a game.");
        }
        throw error;
      }
      // Return the earliest (this week's) game to navigate to.
      const sorted = (data ?? []).sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
      return sorted[0]!;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nearby"] });
      if (user) qc.invalidateQueries({ queryKey: queryKeys.myGames(user.id) });
    },
  });
}

// Re-export the pure label helper so existing imports from this module keep working.
export { statusLabel } from "@/lib/activity-format";
