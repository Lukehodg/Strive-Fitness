import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Message } from "@/types/database";

const key = (activityId: string) => ["messages", activityId] as const;

/**
 * Loads a game's chat history and subscribes to new messages over Supabase
 * Realtime. New inserts are appended to the query cache (RLS decides who
 * receives them). Sender names/avatars are resolved from the roster by the UI.
 */
export function useMessages(activityId: string) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("activity_id", activityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!activityId) return;
    const channel = supabase
      .channel(`messages:${activityId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `activity_id=eq.${activityId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          qc.setQueryData<Message[]>(key(activityId), (old: Message[] | undefined) => {
            if (!old) return [msg];
            if (old.some((m: Message) => m.id === msg.id)) return old; // de-dupe
            return [...old, msg];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activityId, qc]);

  return query;
}

/** Send a chat message. Realtime echoes it back into the list. */
export function useSendMessage(activityId: string) {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (body: string) => {
      if (!user) throw new Error("Not signed in");
      const trimmed = body.trim();
      if (!trimmed) return;
      const { error } = await supabase
        .from("messages")
        .insert({ activity_id: activityId, user_id: user.id, body: trimmed });
      if (error) throw error;
    },
  });
}
