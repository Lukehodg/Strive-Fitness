-- =============================================================================
-- 0001_init.sql — Strive MVP schema (pickup football vertical)
--
-- Design notes:
--  * Activity-first. `activities` is the spine; profiles/participants/chat hang off it.
--  * `activity_type` exists from day one (football|gym|networking) so gym + networking
--    switch on later with no migration. MVP only ever writes/reads 'football'.
--  * All "near me" distance math is PostGIS (geography), never JS.
--  * Every table has RLS. The app uses the anon key only; never the service role.
--  * Locations are stored precisely but only ever surfaced as area label + distance.
-- =============================================================================

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type activity_type as enum ('football', 'gym', 'networking');
create type activity_status as enum ('open', 'full', 'cancelled', 'completed');
create type participant_status as enum ('joined', 'left');

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user (id mirrors auth.users.id)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 2 and 40),
  avatar_url     text,
  area_label     text,                       -- coarse, human label e.g. "Weybridge"
  home_location  geography(Point, 4326),     -- precise; never returned to other users
  phone_verified boolean not null default false,
  bio            text check (bio is null or char_length(bio) <= 280),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index profiles_home_location_idx on public.profiles using gist (home_location);

-- ---------------------------------------------------------------------------
-- activities — a single game / session
-- ---------------------------------------------------------------------------
create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references public.profiles (id) on delete cascade,
  activity_type    activity_type not null default 'football',
  title            text not null check (char_length(title) between 3 and 80),
  venue_label      text not null check (char_length(venue_label) between 2 and 120),
  location         geography(Point, 4326) not null,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  max_players      integer not null check (max_players between 2 and 50),
  status           activity_status not null default 'open',
  notes            text check (notes is null or char_length(notes) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index activities_location_idx on public.activities using gist (location);
create index activities_starts_at_idx on public.activities (starts_at);
create index activities_status_idx on public.activities (status);

-- ---------------------------------------------------------------------------
-- activity_participants — roster (host is auto-added on create via trigger)
-- ---------------------------------------------------------------------------
create table public.activity_participants (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      participant_status not null default 'joined',
  joined_at   timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create index activity_participants_user_idx on public.activity_participants (user_id);

-- ---------------------------------------------------------------------------
-- connections — "play again" / add a mate (symmetric pair, stored one-way)
-- ---------------------------------------------------------------------------
create table public.connections (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, connection_id),
  check (user_id <> connection_id)
);

-- ---------------------------------------------------------------------------
-- blocks — safety. Blocked users vanish from discovery + rosters.
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

-- ---------------------------------------------------------------------------
-- reports — safety. Reviewed out of band; app only inserts.
-- ---------------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id      uuid references public.activities (id) on delete set null,
  reason           text not null,
  details          text check (details is null or char_length(details) <= 1000),
  created_at       timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

-- ---------------------------------------------------------------------------
-- push_tokens — Expo push tokens for reminders / chat nudges
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- =============================================================================
-- Helper functions
-- =============================================================================

-- True if either user has blocked the other. SECURITY DEFINER so it can read
-- blocks regardless of the caller's RLS view.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- Count of active participants on an activity.
create or replace function public.participant_count(a_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.activity_participants
  where activity_id = a_id and status = 'joined';
$$;

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger activities_set_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

-- Host is always on the roster.
create or replace function public.add_host_as_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_participants (activity_id, user_id, status)
  values (new.id, new.host_id, 'joined')
  on conflict do nothing;
  return new;
end;
$$;

create trigger activities_add_host
  after insert on public.activities
  for each row execute function public.add_host_as_participant();

-- Flip status open <-> full based on the live roster count.
create or replace function public.sync_activity_fullness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid := coalesce(new.activity_id, old.activity_id);
  cnt integer;
  mx integer;
  st activity_status;
begin
  select participant_count(a_id) into cnt;
  select max_players, status into mx, st from public.activities where id = a_id;

  -- Don't override terminal states.
  if st in ('cancelled', 'completed') then
    return coalesce(new, old);
  end if;

  if cnt >= mx and st <> 'full' then
    update public.activities set status = 'full' where id = a_id;
  elsif cnt < mx and st = 'full' then
    update public.activities set status = 'open' where id = a_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger participants_sync_fullness
  after insert or update or delete on public.activity_participants
  for each row execute function public.sync_activity_fullness();

-- =============================================================================
-- nearby_activities RPC — proximity-ranked discovery feed
--   Returns upcoming football games within radius_meters of (lat,lng),
--   with distance + live joined count, excluding anything involving a blocked
--   user. SECURITY INVOKER so RLS still applies on top.
-- =============================================================================
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

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles              enable row level security;
alter table public.activities            enable row level security;
alter table public.activity_participants enable row level security;
alter table public.connections           enable row level security;
alter table public.blocks                enable row level security;
alter table public.reports               enable row level security;
alter table public.push_tokens           enable row level security;

-- profiles: readable by any authenticated user unless blocked; writable only by owner.
create policy profiles_select on public.profiles
  for select to authenticated
  using (not public.is_blocked(auth.uid(), id));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- activities: visible to authenticated users (unless host blocked);
-- only verified users may host; only host may edit/delete.
create policy activities_select on public.activities
  for select to authenticated
  using (not public.is_blocked(auth.uid(), host_id));

create policy activities_insert on public.activities
  for insert to authenticated
  with check (
    host_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and phone_verified = true
    )
  );

create policy activities_update on public.activities
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy activities_delete on public.activities
  for delete to authenticated
  using (host_id = auth.uid());

-- participants: rosters readable to authenticated users; you may only add/remove
-- yourself, and only if phone-verified, and not blocked with the host.
create policy participants_select on public.activity_participants
  for select to authenticated
  using (true);

create policy participants_insert on public.activity_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and phone_verified = true
    )
    and exists (
      select 1 from public.activities a
      where a.id = activity_id
        and not public.is_blocked(auth.uid(), a.host_id)
    )
  );

create policy participants_update on public.activity_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy participants_delete on public.activity_participants
  for delete to authenticated
  using (user_id = auth.uid());

-- connections: you own your side.
create policy connections_select on public.connections
  for select to authenticated
  using (user_id = auth.uid() or connection_id = auth.uid());

create policy connections_insert on public.connections
  for insert to authenticated
  with check (user_id = auth.uid());

create policy connections_delete on public.connections
  for delete to authenticated
  using (user_id = auth.uid());

-- blocks: you own your blocks.
create policy blocks_select on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

create policy blocks_insert on public.blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

create policy blocks_delete on public.blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

-- reports: you may file reports; nobody reads them via the app.
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- push_tokens: you own your tokens.
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using (user_id = auth.uid());

create policy push_tokens_insert on public.push_tokens
  for insert to authenticated
  with check (user_id = auth.uid());

create policy push_tokens_delete on public.push_tokens
  for delete to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- Storage — avatars bucket (public read, owner write)
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
