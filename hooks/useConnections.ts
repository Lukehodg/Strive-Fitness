import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export type Connection = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  area_label: string | null;
};

/** People the signed-in user has added via "play again". */
export function useConnections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["connections", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async (): Promise<Connection[]> => {
      const { data, error } = await supabase
        .from("connections")
        .select(
          "connection:profiles!connections_connection_id_fkey(id, display_name, avatar_url, area_label)",
        )
        .eq("user_id", user!.id);
      if (error) throw error;

      type Row = { connection: Connection | null };
      return (data as unknown as Row[])
        .map((r) => r.connection)
        .filter((c): c is Connection => !!c)
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });
}

export function useRemoveConnection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("user_id", user.id)
        .eq("connection_id", connectionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
}
