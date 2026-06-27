-- =============================================================================
-- 0008_game_invites.sql — invite a connection into a game
--
-- The persistent end of the core loop: after playing together you add a mate
-- (connections, 0001), then pull them into your next fixture. An invite is a
-- lightweight ask — the invitee still chooses to join (and is gated on phone
-- verification by the existing participants_insert policy when they accept).
--
-- Notifications are sent from the `send-notifications` Edge Function, invoked
-- by the app when an invite is created / accepted. No new tables needed for
-- push; tokens already live in `push_tokens` (0001).
-- =============================================================================

create type invite_status as enum ('pending', 'accepted', 'declined', 'cancelled');

create table public.game_invites (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  inviter_id   uuid not null references public.profiles (id) on delete cascade,
  invitee_id   uuid not null references public.profiles (id) on delete cascade,
  status       invite_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (inviter_id <> invitee_id),
  -- one live invite per (game, invitee); re-inviting reuses the row
  unique (activity_id, invitee_id)
);

create index game_invites_invitee_idx on public.game_invites (invitee_id, status);
create index game_invites_activity_idx on public.game_invites (activity_id);

-- Stamp responded_at whenever the status leaves 'pending'.
create or replace function public.stamp_invite_response()
returns trigger
language plpgsql
as $$
begin
  if new.status <> old.status and old.status = 'pending' then
    new.responded_at = now();
  end if;
  return new;
end;
$$;

create trigger game_invites_stamp_response
  before update on public.game_invites
  for each row execute function public.stamp_invite_response();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.game_invites enable row level security;

-- Either party to the invite can see it.
create policy game_invites_select on public.game_invites
  for select to authenticated
  using (inviter_id = auth.uid() or invitee_id = auth.uid());

-- You may only invite as yourself, you must be on the game's roster, neither of
-- you may be blocked with the other, and the game must still be live.
create policy game_invites_insert on public.game_invites
  for insert to authenticated
  with check (
    inviter_id = auth.uid()
    and not public.is_blocked(auth.uid(), invitee_id)
    and exists (
      select 1 from public.activity_participants ap
      where ap.activity_id = activity_id
        and ap.user_id = auth.uid()
        and ap.status = 'joined'
    )
    and exists (
      select 1 from public.activities a
      where a.id = activity_id
        and a.status in ('open', 'full')
        and a.starts_at > now()
    )
  );

-- The invitee accepts/declines; the inviter can cancel. Both sides are bounded
-- to invites they're part of.
create policy game_invites_update on public.game_invites
  for update to authenticated
  using (invitee_id = auth.uid() or inviter_id = auth.uid())
  with check (invitee_id = auth.uid() or inviter_id = auth.uid());

-- Re-inviting (after a decline / cancel) is an upsert from the app; allow the
-- inviter to delete their own stale invite rows.
create policy game_invites_delete on public.game_invites
  for delete to authenticated
  using (inviter_id = auth.uid());
