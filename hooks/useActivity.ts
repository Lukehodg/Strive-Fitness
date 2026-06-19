import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, toPoint } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { channelIdForActivity, connectStreamUser } from "@/lib/stream";
import type { Activity, ActivityStatus } from "@/types/database";

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

      // Best-effort: join the game's Stream channel. Non-fatal if chat is down.
      try {
        const sc = await connectStreamUser();
        const channel = sc.channel("messaging", channelIdForActivity(activityId));
        await channel.addMembers([user.id]);
      } catch (e) {
        console.warn("[chat] could not add to channel", e);
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

      try {
        const sc = await connectStreamUser();
        const channel = sc.channel("messaging", channelIdForActivity(activityId));
        await channel.removeMembers([user.id]);
      } catch (e) {
        console.warn("[chat] could not remove from channel", e);
      }
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
};

/** Create a football game. RLS requires the host to be phone-verified. */
export function useCreateActivity() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActivityInput): Promise<Activity> => {
      if (!user) throw new Error("Not signed in");
      const { location, ...rest } = input;
      const { data, error } = await supabase
        .from("activities")
        .insert({
          host_id: user.id,
          activity_type: "football",
          ...rest,
          location: toPoint(location.longitude, location.latitude),
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "42501" || error.message.includes("row-level security")) {
          throw new Error("Verify your phone number before hosting a game.");
        }
        throw error;
      }

      // Create the game's Stream channel up front so chat is ready on join.
      try {
        const sc = await connectStreamUser();
        const channel = sc.channel("messaging", channelIdForActivity(data.id), {
          members: [user.id],
          name: data.title,
        });
        await channel.create();
      } catch (e) {
        console.warn("[chat] could not create channel", e);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nearby"] });
      if (user) qc.invalidateQueries({ queryKey: queryKeys.myGames(user.id) });
    },
  });
}

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
