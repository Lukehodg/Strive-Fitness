-- =============================================================================
-- 0010_strava.sql — Strava integration (privacy-safe profile activity)
--
-- Two tables:
--   * strava_accounts   — the OAuth link + tokens for a user. Tokens are
--     SECRETS: written only by the `strava` Edge Function (service role) and
--     hidden from the app role via column grants (RLS can't gate columns).
--   * strava_activities — a cache of recent activities to render on profiles.
--     We deliberately store STATS ONLY — no GPS, start/end point, or route
--     polyline — so a profile can never leak someone's home/location. This is
--     the same non-negotiable as everywhere else: distance + summary, never a map.
-- =============================================================================

create table public.strava_accounts (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  athlete_id    bigint not null,
  username      text,
  firstname     text,
  lastname      text,
  profile_url   text,                 -- Strava avatar (medium); display only
  scope         text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null, -- access-token expiry
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger strava_accounts_set_updated_at
  before update on public.strava_accounts
  for each row execute function public.set_updated_at();

create table public.strava_activities (
  id                   bigint primary key,   -- Strava activity id
  user_id              uuid not null references public.profiles (id) on delete cascade,
  name                 text,
  sport_type           text,
  distance_m           double precision,
  moving_time_s        integer,
  elapsed_time_s       integer,
  total_elevation_gain double precision,
  average_speed        double precision,      -- m/s (for pace/speed)
  start_date           timestamptz,
  created_at           timestamptz not null default now()
  -- NO start_latlng / end_latlng / map polyline — privacy by omission.
);

create index strava_activities_user_idx
  on public.strava_activities (user_id, start_date desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.strava_accounts   enable row level security;
alter table public.strava_activities enable row level security;

-- accounts: a user may read *their own* connection. Tokens are stripped from
-- the app role by the column grants below. All writes go through the Edge
-- Function with the service role, so there are no insert/update/delete policies.
create policy strava_accounts_select_own on public.strava_accounts
  for select to authenticated
  using (user_id = auth.uid());

-- Column-level: hide the token columns from anon/authenticated entirely; the
-- service role (Edge Function) bypasses this and still sees everything.
revoke select on public.strava_accounts from anon, authenticated;
grant select (
  user_id, athlete_id, username, firstname, lastname,
  profile_url, scope, expires_at, created_at, updated_at
) on public.strava_accounts to authenticated;

-- activities: visible to any authenticated user (so they can show on a profile),
-- minus anyone blocked. Stats only, so this is privacy-safe. Writes are service
-- role only.
create policy strava_activities_select on public.strava_activities
  for select to authenticated
  using (not public.is_blocked(auth.uid(), user_id));
