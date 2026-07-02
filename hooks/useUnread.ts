import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

const unreadKey = (userId: string) => ["unread", userId] as const;

/**
 * Unread message counts per game the user is joined to, as { activityId: n }.
 * One RPC round trip; polled gently so badges stay honest while the app is up.
 */
export function useUnreadCounts() {
  const { user } = useAuth();
  return useQuery<Record<string, number>>({
    queryKey: unreadKey(user?.id ?? "anon"),
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("unread_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) map[row.activity_id] = row.unread;
      return map;
    },
  });
}

/** Sum across games — for the tab-bar badge. */
export function useUnreadTotal(): number {
  const { data } = useUnreadCounts();
  if (!data) return 0;
  let total = 0;
  for (const id in data) total += data[id] ?? 0;
  return total;
}

/**
 * Stamp "read up to now" for a chat. Called on open and as new messages land
 * while the chat is on screen.
 */
export function useMarkChatRead(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("chat_reads")
        .upsert({ activity_id: activityId, user_id: user.id, last_read_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => {
      if (!user) return;
      qc.setQueryData(unreadKey(user.id), (old: Record<string, number> | undefined) => {
        if (!old || !old[activityId]) return old;
        const { [activityId]: _cleared, ...rest } = old;
        return rest;
      });
    },
  });
}
