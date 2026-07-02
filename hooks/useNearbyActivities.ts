import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryClient";
import { coarseCoords, type Coords } from "@/lib/location";
import type { NearbyActivity } from "@/types/database";

/**
 * Proximity-ranked activities near `coords` via the `nearby_activities` PostGIS
 * RPC. Returns every sport (the Discover screen filters by the chosen sport
 * chip); distance + ranking are computed in Postgres, never in JS.
 *
 * Coords are coarsened to ~110m first, so every screen asking from roughly the
 * same place shares one cached result (and the server never sees exact GPS).
 */
export function useNearbyActivities(coords: Coords | null, radiusMeters = 25000) {
  const at = coords ? coarseCoords(coords) : null;
  return useQuery({
    queryKey: queryKeys.nearby(at?.latitude ?? 0, at?.longitude ?? 0, radiusMeters),
    enabled: !!at,
    queryFn: async (): Promise<NearbyActivity[]> => {
      const { data, error } = await supabase.rpc("nearby_activities", {
        lat: at!.latitude,
        lng: at!.longitude,
        radius_meters: radiusMeters,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
