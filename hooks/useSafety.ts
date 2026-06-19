import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

/**
 * Block a user. After this, RLS hides them from discovery, rosters, and
 * profile reads in both directions (see is_blocked() in 0001_init.sql).
 */
export function useBlockUser() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (blockedId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("blocks")
        .upsert({ blocker_id: user.id, blocked_id: blockedId });
      if (error) throw error;
    },
    onSuccess: () => {
      // Anything that could include the blocked user must refresh.
      qc.invalidateQueries({ queryKey: ["nearby"] });
      qc.invalidateQueries({ queryKey: ["roster"] });
      if (user) qc.invalidateQueries({ queryKey: ["my-games", user.id] });
    },
  });
}

export type ReportInput = {
  reportedUserId: string;
  activityId?: string;
  reason: string;
  details?: string;
};

/** File a report. The app only ever inserts; review happens out of band. */
export function useReportUser() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ reportedUserId, activityId, reason, details }: ReportInput) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("reports").insert({
        reporter_id: user.id,
        reported_user_id: reportedUserId,
        activity_id: activityId ?? null,
        reason,
        details: details ?? null,
      });
      if (error) throw error;
    },
  });
}

/** "Play again" — add a player you met as a connection for future games. */
export function useAddConnection() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("connections")
        .upsert({ user_id: user.id, connection_id: connectionId });
      if (error) throw error;
    },
  });
}
