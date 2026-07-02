-- =============================================================================
-- 0015_waitlist.sql — waitlist for full games
--
-- A full game is no longer a dead end: users queue on `activity_waitlist`, and
-- when a spot opens (someone leaves, or the host raises max_players) the
-- EARLIEST waitlisted player is promoted onto the roster automatically by a
-- trigger — and pinged via push (same Vault + pg_net plumbing as 0011; the
-- notification is best-effort and never blocks the promotion).
--
-- Also closes a pre-existing gap this feature exposes: joining was never
-- capacity-checked server-side (only the UI stopped it). participants_insert /
-- participants_update are recreated with a fullness check. (Two simultaneous
-- joins racing for the last spot can still briefly overfill by one — acceptable
-- at MVP scale, and strictly better than no check at all.)
-- =============================================================================

create extension if not exists pg_net;  -- no-op if 0011 already enabled it

create table public.activity_waitlist (
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);

create index activity_waitlist_order_idx
  on public.activity_waitlist (activity_id, created_at);

-- ---------------------------------------------------------------------------
-- Promotion: fill open spots from the front of the queue.
-- SECURITY DEFINER so it can write the roster regardless of the leaver's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.notify_waitlist_promotion(a_id uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url  text;
  svc_key text;
  a_title text;
begin
  select decrypted_secret into fn_url  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key';
  if fn_url is null or svc_key is null then return; end if;

  select title into a_title from public.activities where id = a_id;

  perform net.http_post(
    url     := fn_url || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := jsonb_build_object(
      'userIds', jsonb_build_array(uid),
      'title', 'You''re in! 🎉',
      'body', 'A spot opened up in ' || coalesce(a_title, 'a game') || ' — you''re on the roster.',
      'data', jsonb_build_object('type', 'game', 'activityId', a_id)
    )
  );
exception when others then
  null;  -- push is a nicety; promotion must never fail because of it
end;
$$;

create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_id uuid;
  mx   integer;
  st   activity_status;
  wu   uuid;
begin
  if tg_table_name = 'activities' then
    a_id := new.id;
  else
    a_id := coalesce(new.activity_id, old.activity_id);
  end if;

  loop
    select max_players, status into mx, st from public.activities where id = a_id;
    exit when st is null or st in ('cancelled', 'completed');
    exit when public.participant_count(a_id) >= mx;

    select w.user_id into wu
    from public.activity_waitlist w
    where w.activity_id = a_id
    order by w.created_at asc
    limit 1
    for update skip locked;
    exit when wu is null;

    -- The user may have joined-then-left before: upsert back to 'joined'.
    insert into public.activity_participants (activity_id, user_id, status)
    values (a_id, wu, 'joined')
    on conflict (activity_id, user_id)
      do update set status = 'joined', joined_at = now();

    delete from public.activity_waitlist where activity_id = a_id and user_id = wu;

    perform public.notify_waitlist_promotion(a_id, wu);
  end loop;

  return coalesce(new, old);
end;
$$;

-- A spot opens when someone leaves…
create trigger participants_promote_waitlist
  after update or delete on public.activity_participants
  for each row execute function public.promote_from_waitlist();

-- …or when the host raises capacity.
create trigger activities_promote_waitlist
  after update of max_players on public.activities
  for each row execute function public.promote_from_waitlist();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.activity_waitlist enable row level security;

-- Waitlists are visible with the same rules as rosters: only for activities
-- you can see, never surfacing someone you're blocked with.
create policy waitlist_select on public.activity_waitlist
  for select to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.id = activity_id
        and not public.is_blocked(auth.uid(), a.host_id)
    )
    and not public.is_blocked(auth.uid(), user_id)
  );

-- Queue yourself: verified, not suspended, not blocked with the host, and the
-- game must actually be full and still upcoming.
create policy waitlist_insert on public.activity_waitlist
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and exists (
      select 1 from public.profiles where id = auth.uid() and phone_verified = true
    )
    and exists (
      select 1 from public.activities a
      where a.id = activity_id
        and a.status = 'full'
        and a.starts_at > now()
        and not public.is_blocked(auth.uid(), a.host_id)
    )
  );

-- Leave the queue yourself.
create policy waitlist_delete on public.activity_waitlist
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Enforce capacity on the roster itself (previously UI-only).
-- Promotions bypass this: promote_from_waitlist is SECURITY DEFINER.
-- ---------------------------------------------------------------------------
drop policy if exists participants_insert on public.activity_participants;
create policy participants_insert on public.activity_participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_suspended(auth.uid())
    and exists (
      select 1 from public.profiles where id = auth.uid() and phone_verified = true
    )
    and exists (
      select 1 from public.activities a
      where a.id = activity_id
        and not public.is_blocked(auth.uid(), a.host_id)
        and public.participant_count(a.id) < a.max_players
    )
  );

-- Updates: you may always set yourself 'left'; flipping back to 'joined'
-- (rejoin after leaving) requires a free spot.
drop policy if exists participants_update on public.activity_participants;
create policy participants_update on public.activity_participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      status = 'left'
      or exists (
        select 1 from public.activities a
        where a.id = activity_id
          and public.participant_count(a.id) < a.max_players
      )
    )
  );
