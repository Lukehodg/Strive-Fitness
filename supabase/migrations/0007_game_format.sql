-- =============================================================================
-- 0007_game_format.sql — format + skill level on games
-- =============================================================================

alter table public.activities
  add column format text not null default 'kickabout'
    check (format in ('kickabout', '5-a-side', '7-a-side', '11-a-side')),
  add column skill_level text not null default 'all'
    check (skill_level in ('all', 'casual', 'competitive'));

-- Surface format + skill in discovery (drop + recreate to change the return type).
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
    st_y(a.location::geometry) as venue_lat,
    st_x(a.location::geometry) as venue_lng,
    a.starts_at,
    a.duration_minutes,
    a.max_players,
    a.status,
    a.format,
    a.skill_level,
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
