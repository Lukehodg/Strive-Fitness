import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { capture } from "@/lib/analytics";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

export type WaitlistEntry = { user_id: string; created_at: string };

const key = (activityId: string) => ["waitlist", activityId] as const;

/**
 * A full game's queue, front first. Promotion is server-side: when a spot
 * opens, a trigger moves the earliest entry onto the roster and pushes them a
 * "you're in" notification — the app only ever joins or leaves the queue.
 */
export function useWaitlist(activityId: string) {
  return useQuery({
    queryKey: key(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<WaitlistEntry[]> => {
      const { data, error } = await supabase
        .from("activity_waitlist")
        .select("user_id, created_at")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, activityId: string) {
  qc.invalidateQueries({ queryKey: key(activityId) });
  // Promotion may have already moved someone (possibly us) onto the roster.
  qc.invalidateQueries({ queryKey: queryKeys.roster(activityId) });
  qc.invalidateQueries({ queryKey: queryKeys.activity(activityId) });
}

/** Queue for a spot. RLS enforces verified + not suspended + game actually full. */
export function useJoinWaitlist(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("activity_waitlist")
        .upsert({ activity_id: activityId, user_id: user.id });
      if (error) {
        if (error.code === "42501" || error.message.includes("row-level security")) {
          throw new Error(
            "Couldn't join the waitlist — the game may have reopened. Pull to refresh.",
          );
        }
        throw error;
      }
      capture("waitlist_joined", { activityId });
    },
    onSuccess: () => invalidate(qc, activityId),
  });
}

/** Step out of the queue. */
export function useLeaveWaitlist(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("activity_waitlist")
        .delete()
        .eq("activity_id", activityId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc, activityId),
  });
}
