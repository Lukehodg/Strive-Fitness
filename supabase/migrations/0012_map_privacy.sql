-- =============================================================================
-- 0012_map_privacy.sql — approximate map coordinates
--
-- Discovery no longer returns exact venue coordinates. Each pin is nudged by a
-- small, DETERMINISTIC offset (~±150m) derived from the activity id, so:
--   * the marker shows an approximate area, never a precise point (matters for
--     runs/rides that may start near someone's home);
--   * it's stable — the pin doesn't jump around between queries.
-- `distance_meters` is still computed from the REAL location, so ranking and the
-- "x km away" label stay accurate.
-- =============================================================================

drop function if exists public.nearby_activities(
  double precision, double precision, double precision, activity_type
);

create or replace function public.nearby_activities(
  lat double precision,
  lng double precision,
  radius_meters double precision default 25000,
  type_filter activity_type default null
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
  activity_type    activity_type,
  format           text,
  skill_level      text,
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
    -- ~±150m deterministic jitter from the id (get_byte gives 0..255).
    st_y(a.location::geometry)
      + (get_byte(decode(md5(a.id::text), 'hex'), 0) - 128) / 128.0 * 0.0015 as venue_lat,
    st_x(a.location::geometry)
      + (get_byte(decode(md5(a.id::text), 'hex'), 1) - 128) / 128.0 * 0.0015 as venue_lng,
    a.starts_at,
    a.duration_minutes,
    a.max_players,
    a.status,
    a.activity_type,
    a.format,
    a.skill_level,
    st_distance(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography) as distance_meters,
    participant_count(a.id) as joined_count
  from public.activities a
  join public.profiles p on p.id = a.host_id
  where (type_filter is null or a.activity_type = type_filter)
    and a.status in ('open', 'full')
    and a.starts_at > now()
    and st_dwithin(a.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography, radius_meters)
    and not public.is_blocked(auth.uid(), a.host_id)
  order by distance_meters asc, a.starts_at asc;
$$;
