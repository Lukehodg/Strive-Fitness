import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { capture } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import type { ActivityResult } from "@/types/database";

const key = (activityId: string) => ["result", activityId] as const;

/** The recorded final score for a game, if any. */
export function useResult(activityId: string) {
  return useQuery({
    queryKey: key(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<ActivityResult | null> => {
      const { data, error } = await supabase
        .from("activity_results")
        .select("*")
        .eq("activity_id", activityId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * Record (or correct) the final score — host only, past games only (RLS).
 * The roster gets a "Full time" push.
 */
export function useSaveResult(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      scoreA: number;
      scoreB: number;
      note?: string;
      gameTitle: string;
    }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("activity_results").upsert({
        activity_id: activityId,
        score_a: input.scoreA,
        score_b: input.scoreB,
        note: input.note?.trim() || null,
        recorded_by: user.id,
      });
      if (error) {
        if (error.code === "42501" || error.message.includes("row-level security")) {
          throw new Error("Only the host can record the result, once the game has started.");
        }
        throw error;
      }

      void notify({
        activityId,
        excludeUserId: user.id,
        title: "Full time",
        body: `${input.gameTitle}: ${input.scoreA}–${input.scoreB}`,
        data: { type: "game", activityId },
      });
      capture("result_recorded", { activityId });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(activityId) }),
  });
}
