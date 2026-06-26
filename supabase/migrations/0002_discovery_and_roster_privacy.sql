-- =============================================================================
-- 0002 — return venue coordinates from discovery + tighten roster visibility
--
--  * nearby_activities now returns the game's venue lat/lng so the map can place
--    each marker at the actual game (venues are public meeting points; the
--    privacy rule concerns profiles.home_location, which is never returned).
--  * participant rosters are no longer world-readable: you can see a roster only
--    for activities you can see, and blocked users are filtered out both ways.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roster visibility: replace the permissive `using (true)` select policy.
-- ---------------------------------------------------------------------------
drop policy if exists participants_select on public.activity_participants;

create policy participants_select on public.activity_participants
  for select to authenticated
  using (
    -- only for activities you're allowed to see (host not blocked)
    exists (
      select 1 from public.activities a
      where a.id = activity_id
        and not public.is_blocked(auth.uid(), a.host_id)
    )
    -- and never surface a participant you're blocked with
    and not public.is_blocked(auth.uid(), user_id)
  );

-- ---------------------------------------------------------------------------
-- Discovery RPC: add venue lat/lng to the result.
-- (Return type changes, so drop + recreate.)
-- ---------------------------------------------------------------------------
drop function if exists public.nearby_activities(
  double precision, double precision, double precision, activity_type
);

create or replace function public.nearby_activities(
  lat double precision,
  lng double precision,
  radius_meters double precision default 25000,
  type_filter activity_type default 'football'
)
returns table (
  id               uuid,
  host_id          uuid,
  host_name        text,
  title            text,
  venue_label      text,
  venue_lat        double precision,
  venue_lng        double precision,
  starts_at        timestamptz,
  duration_minutes integer,
  max_players      integer,
  status           activity_status,
  distance_meters  double precision,
  joined_count     integer
)
language sql
stable
set search_path = public
as $$
  select
    a.id,
    a.host_id,
    p.display_name as host_name,
    a.title,
    a.venue_label,
    st_y(a.location::geometry) as venue_lat,
    st_x(a.location::geometry) as venue_lng,
    a.starts_at,
    a.duration_minutes,
    a.max_players,
    a.status,
    st_distance(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_meters,
    participant_count(a.id) as joined_count
  from public.activities a
  join public.profiles p on p.id = a.host_id
  where a.activity_type = type_filter
    and a.status in ('open', 'full')
    and a.starts_at > now()
    and st_dwithin(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_meters)
    and not public.is_blocked(auth.uid(), a.host_id)
  order by distance_meters asc, a.starts_at asc;
$$;
