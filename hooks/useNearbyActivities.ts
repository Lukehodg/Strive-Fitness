import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryClient";
import type { Coords } from "@/lib/location";
import type { NearbyActivity } from "@/types/database";

/**
 * Proximity-ranked football games near `coords` via the `nearby_activities`
 * PostGIS RPC. Distance + ranking are computed in Postgres, never in JS.
 */
export function useNearbyActivities(coords: Coords | null, radiusMeters = 25000) {
  return useQuery({
    queryKey: queryKeys.nearby(coords?.latitude ?? 0, coords?.longitude ?? 0, radiusMeters),
    enabled: !!coords,
    queryFn: async (): Promise<NearbyActivity[]> => {
      const { data, error } = await supabase.rpc("nearby_activities", {
        lat: coords!.latitude,
        lng: coords!.longitude,
        radius_meters: radiusMeters,
        type_filter: "football",
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
