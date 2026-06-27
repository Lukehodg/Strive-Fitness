import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import type { Coords } from "@/lib/location";
import type { Event, UpcomingEvent } from "@/types/database";

/** Upcoming curated events (parkruns, races) with distance from `coords`. */
export function useUpcomingEvents(coords: Coords | null) {
  return useQuery({
    queryKey: ["events", coords?.latitude ?? 0, coords?.longitude ?? 0],
    enabled: !!coords,
    queryFn: async (): Promise<UpcomingEvent[]> => {
      const { data, error } = await supabase.rpc("upcoming_events", {
        lat: coords!.latitude,
        lng: coords!.longitude,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** A single event by id (full row, for the detail screen). */
export function useEvent(eventId: string) {
  return useQuery({
    queryKey: ["event", eventId],
    enabled: !!eventId,
    queryFn: async (): Promise<Event | null> => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
