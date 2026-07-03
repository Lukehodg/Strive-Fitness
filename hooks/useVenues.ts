import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Coords } from "@/lib/location";
import type { Venue } from "@/types/database";

/** Your saved venues, most recently used first. */
export function useVenues() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["venues", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async (): Promise<Venue[]> => {
      const { data, error } = await supabase
        .from("venues")
        .select("*")
        .order("used_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Best-effort save of a venue into the owner's book (called after creating a
 * game — reuse bumps used_at so the book stays ordered by recency). Never
 * throws: the venue book must not be able to fail game creation.
 */
export async function saveVenueQuiet(userId: string, label: string, coords: Coords) {
  try {
    await supabase.from("venues").upsert(
      {
        owner_id: userId,
        label: label.trim(),
        lat: coords.latitude,
        lng: coords.longitude,
        used_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,label" },
    );
  } catch {
    // quiet by design
  }
}

/** Remove a venue from the book. */
export function useDeleteVenue() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (venueId: string) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("venues").delete().eq("id", venueId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["venues"] }),
  });
}
