-- =============================================================================
-- 0019_results_and_venues.sql — game results + a personal venue book
--
-- Results: the host records a final score on a past game (score sports only —
-- the app gates which). One row per game, host-editable, visible to anyone who
-- can see the game. Feeds banter; later, head-to-head win records.
--
-- Venues: a personal book of places you've hosted at, auto-saved on create and
-- offered as one-tap chips next time. Owner-only in every direction (it's your
-- book, and venue coords stay private to you — the game's own location is what
-- others see, jittered as of 0012). Plain lat/lng (no PostGIS) — nothing needs
-- distance math here, and the app can read the values back directly.
-- =============================================================================

create table public.activity_results (
  activity_id uuid primary key references public.activities (id) on delete cascade,
  score_a     integer not null check (score_a between 0 and 999),
  score_b     integer not null check (score_b between 0 and 999),
  note        text check (note is null or char_length(note) <= 140),
  recorded_by uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger activity_results_set_updated_at
  before update on public.activity_results
  for each row execute function public.set_updated_at();

alter table public.activity_results enable row level security;

-- Visible wherever the game is visible.
create policy results_select on public.activity_results
  for select to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_id
        and not public.is_blocked(auth.uid(), a.host_id)
    )
  );

-- Only the host records/edits, and only once the game has kicked off.
create policy results_insert on public.activity_results
  for insert to authenticated
  with check (
    recorded_by = auth.uid()
    and exists (
      select 1 from public.activities a
      where a.id = activity_id
        and a.host_id = auth.uid()
        and a.starts_at < now()
    )
  );

create policy results_update on public.activity_results
  for update to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_id and a.host_id = auth.uid()
    )
  )
  with check (recorded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Personal venue book
-- ---------------------------------------------------------------------------
create table public.venues (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  label      text not null check (char_length(label) between 2 and 120),
  lat        double precision not null,
  lng        double precision not null,
  used_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner_id, label)
);

create index venues_owner_idx on public.venues (owner_id, used_at desc);

alter table public.venues enable row level security;

create policy venues_select on public.venues
  for select to authenticated
  using (owner_id = auth.uid());

create policy venues_insert on public.venues
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy venues_update on public.venues
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy venues_delete on public.venues
  for delete to authenticated
  using (owner_id = auth.uid());
