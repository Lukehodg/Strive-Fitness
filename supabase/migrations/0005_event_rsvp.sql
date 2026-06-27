-- =============================================================================
-- 0005_event_rsvp.sql — "I'm going" for events
--
-- A lightweight RSVP: a row per (event, user). Events are curated/read-only, so
-- attendance is the only thing users write here. Surfaced in "My Games".
-- =============================================================================

create table public.event_attendees (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_attendees_user_idx on public.event_attendees (user_id);

alter table public.event_attendees enable row level security;

-- You only ever see and manage your own RSVPs.
create policy event_attendees_select on public.event_attendees
  for select to authenticated
  using (user_id = auth.uid());

create policy event_attendees_insert on public.event_attendees
  for insert to authenticated
  with check (user_id = auth.uid());

create policy event_attendees_delete on public.event_attendees
  for delete to authenticated
  using (user_id = auth.uid());
