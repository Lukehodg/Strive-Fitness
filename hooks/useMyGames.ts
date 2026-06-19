import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Activity } from "@/types/database";

export type MyGame = Activity & { hosting: boolean };

/**
 * Games the signed-in user is on the roster for (joined), split by whether they
 * host. Used by the "My Games" tab. Upcoming first.
 */
export function useMyGames() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.myGames(user?.id ?? "anon"),
    enabled: !!user,
    queryFn: async (): Promise<MyGame[]> => {
      const { data, error } = await supabase
        .from("activity_participants")
        .select("activity:activities!activity_participants_activity_id_fkey(*)")
        .eq("user_id", user!.id)
        .eq("status", "joined");
      if (error) throw error;

      type Row = { activity: Activity | null };
      // Cast through unknown: placeholder DB types omit relationships.
      return (data as unknown as Row[])
        .map((r) => r.activity)
        .filter((a): a is Activity => !!a)
        .map((a) => ({ ...a, hosting: a.host_id === user!.id }))
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    },
  });
}
