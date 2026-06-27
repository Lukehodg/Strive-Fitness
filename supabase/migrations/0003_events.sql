-- =============================================================================
-- 0003_events.sql — curated real-world events (parkruns, races, etc.)
--
-- Unlike `activities` (user-created pickup games), events are organised
-- real-world happenings — browse-and-go, with an external link to register.
-- They're curated (seeded / added by an admin), so the app only ever reads them.
-- =============================================================================

create type event_type as enum ('parkrun', '5k', '10k', 'half_marathon', 'marathon', 'other');

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  event_type   event_type not null default 'other',
  starts_at    timestamptz not null,
  venue_label  text not null,
  location     geography(Point, 4326),
  distance_km  double precision,
  description  text,
  external_url text,
  organizer    text,
  created_at   timestamptz not null default now()
);

create index events_starts_at_idx on public.events (starts_at);
create index events_location_idx on public.events using gist (location);

-- ---------------------------------------------------------------------------
-- RLS: any signed-in user can read events; nobody inserts via the app
-- (curation happens through the dashboard / service role).
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;

create policy events_select on public.events
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- upcoming_events — future events ordered by date, with distance from (lat,lng).
-- No radius filter: people travel for races, so show everything upcoming and
-- let the UI surface distance.
-- ---------------------------------------------------------------------------
create or replace function public.upcoming_events(
  lat double precision,
  lng double precision
)
returns table (
  id              uuid,
  title           text,
  event_type      event_type,
  starts_at       timestamptz,
  venue_label     text,
  distance_km     double precision,
  description     text,
  external_url    text,
  organizer       text,
  distance_meters double precision
)
language sql
stable
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.event_type,
    e.starts_at,
    e.venue_label,
    e.distance_km,
    e.description,
    e.external_url,
    e.organizer,
    case
      when e.location is null then null
      else st_distance(e.location, st_setsrid(st_makepoint(lng, lat), 4326)::geography)
    end as distance_meters
  from public.events e
  where e.starts_at > now()
  order by e.starts_at asc;
$$;
