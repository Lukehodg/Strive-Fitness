-- =============================================================================
-- 0006_messages.sql — built-in group chat per game (Supabase Realtime)
--
-- Replaces the third-party chat. One row per message; only joined participants
-- of a game can read or post. Realtime broadcasts inserts to the game's crew.
-- =============================================================================

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index messages_activity_idx on public.messages (activity_id, created_at);

-- True if the user is on the activity's active roster. SECURITY DEFINER so the
-- policy can check membership without its own RLS recursion.
create or replace function public.is_participant(a_id uuid, u_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.activity_participants
    where activity_id = a_id and user_id = u_id and status = 'joined'
  );
$$;

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_participant(activity_id, auth.uid()));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_participant(activity_id, auth.uid())
  );

-- Broadcast inserts to subscribers (RLS still gates who receives them).
alter publication supabase_realtime add table public.messages;
