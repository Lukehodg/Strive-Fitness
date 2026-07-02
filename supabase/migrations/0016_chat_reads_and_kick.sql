-- =============================================================================
-- 0016_chat_reads_and_kick.sql — unread-chat tracking + host removes a player
--
-- Unread badges: `chat_reads` stores each user's last-read time per game chat
-- (the app upserts it while the chat is open). `unread_counts()` returns, in
-- one round trip, how many messages the caller hasn't seen per game they're
-- joined to. SECURITY INVOKER, so messages RLS still applies.
--
-- Host kick: hosts may DELETE other players' roster rows for their own games.
-- A kick frees a spot, so the 0015 waitlist trigger auto-promotes the next in
-- line. A kicked player can rejoin (it's not a ban) — if the host wants them
-- gone for good, blocking (0001) already prevents rejoining entirely.
-- =============================================================================

create table public.chat_reads (
  activity_id  uuid not null references public.activities (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

alter table public.chat_reads enable row level security;

-- Strictly personal: only your own read-markers, in every direction.
create policy chat_reads_select on public.chat_reads
  for select to authenticated
  using (user_id = auth.uid());

create policy chat_reads_insert on public.chat_reads
  for insert to authenticated
  with check (user_id = auth.uid());

create policy chat_reads_update on public.chat_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Per-game unread counts for the caller, one round trip.
create or replace function public.unread_counts()
returns table (activity_id uuid, unread integer)
language sql
stable
set search_path = public
as $$
  select m.activity_id, count(*)::int as unread
  from public.messages m
  join public.activity_participants ap
    on ap.activity_id = m.activity_id
   and ap.user_id = auth.uid()
   and ap.status = 'joined'
  left join public.chat_reads r
    on r.activity_id = m.activity_id and r.user_id = auth.uid()
  where m.user_id <> auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
  group by m.activity_id;
$$;

-- ---------------------------------------------------------------------------
-- Host kick: an additional (permissive) delete policy alongside self-delete.
-- ---------------------------------------------------------------------------
create policy participants_delete_host on public.activity_participants
  for delete to authenticated
  using (
    user_id <> auth.uid()  -- hosts leave/cancel via the normal flows
    and exists (
      select 1 from public.activities a
      where a.id = activity_id and a.host_id = auth.uid()
    )
  );
