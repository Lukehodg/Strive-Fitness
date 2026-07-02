import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { coarseCoords, type Coords } from "@/lib/location";
import type { Event, UpcomingEvent } from "@/types/database";

/** Upcoming curated events (parkruns, races) with distance from `coords`. */
export function useUpcomingEvents(coords: Coords | null) {
  // ~110m coords keep the cache key stable across GPS wobble (see coarseCoords).
  const at = coords ? coarseCoords(coords) : null;
  return useQuery({
    queryKey: ["events", at?.latitude ?? 0, at?.longitude ?? 0],
    enabled: !!at,
    queryFn: async (): Promise<UpcomingEvent[]> => {
      const { data, error } = await supabase.rpc("upcoming_events", {
        lat: at!.latitude,
        lng: at!.longitude,
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

/** Whether the signed-in user has RSVP'd "going" to an event. */
export function useEventGoing(eventId: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["event-going", eventId, user?.id ?? "anon"],
    enabled: !!eventId && !!user,
    queryFn: async (): Promise<boolean> => {
      const { count, error } = await supabase
        .from("event_attendees")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("user_id", user!.id);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

/** Toggle "I'm going" for an event. */
export function useToggleEventRsvp(eventId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (going: boolean) => {
      if (!user) throw new Error("Not signed in");
      if (going) {
        const { error } = await supabase
          .from("event_attendees")
          .upsert({ event_id: eventId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("event_attendees")
          .delete()
          .eq("event_id", eventId)
          .eq("user_id", user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-going", eventId] });
      if (user) qc.invalidateQueries({ queryKey: ["my-events", user.id] });
    },
  });
}

/** Upcoming events the signed-in user has RSVP'd to (for "My Games"). */
export function useMyEvents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-events", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async (): Promise<Event[]> => {
      const { data, error } = await supabase
        .from("event_attendees")
        .select("event:events!event_attendees_event_id_fkey(*)")
        .eq("user_id", user!.id);
      if (error) throw error;

      type Row = { event: Event | null };
      return (data as unknown as Row[])
        .map((r) => r.event)
        .filter((e): e is Event => !!e && +new Date(e.starts_at) >= Date.now())
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    },
  });
}
