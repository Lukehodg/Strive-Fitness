-- =============================================================================
-- 0018_checkins_streaks_h2h.sql — day-before check-ins, weekly streaks,
-- head-to-head counts
--
-- 1) Day-before check-ins: a second pg_cron job (same Vault + pg_net plumbing
--    as 0011) pings each roster ~24h before kickoff — "Still in for tomorrow?"
--    Dropping out early frees the spot for the waitlist (0015) while there's
--    still time to fill it. Sent once per game via checkin_sent_at.
--
-- 2) player_stats gains current_streak_weeks (consecutive weeks, ending this
--    week or last, with at least one game) — fuel for streak badges.
--
-- 3) played_together(target): how many past games the caller and target were
--    both on. Shared history, so no friends-gate — just blocks.
-- =============================================================================

alter table public.activities add column if not exists checkin_sent_at timestamptz;

create or replace function public.send_day_before_checkins()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url  text;
  svc_key text;
  a       record;
begin
  select decrypted_secret into fn_url  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key';
  if fn_url is null or svc_key is null then
    raise notice 'checkins: set Vault secrets project_url + service_role_key';
    return;
  end if;

  for a in
    select id, title
    from public.activities
    where status in ('open', 'full')
      and checkin_sent_at is null
      and starts_at between now() + interval '22 hours' and now() + interval '26 hours'
  loop
    perform net.http_post(
      url     := fn_url || '/functions/v1/send-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body    := jsonb_build_object(
        'activityId', a.id,
        'title', 'Still in for tomorrow?',
        'body', a.title || ' is tomorrow. Can''t make it? Drop out now so the waitlist can fill your spot.',
        'data', jsonb_build_object('type', 'game', 'activityId', a.id)
      )
    );
    update public.activities set checkin_sent_at = now() where id = a.id;
  end loop;
end;
$$;

select cron.unschedule('send-day-before-checkins')
  where exists (select 1 from cron.job where jobname = 'send-day-before-checkins');

select cron.schedule('send-day-before-checkins', '*/10 * * * *',
  $$ select public.send_day_before_checkins(); $$);

-- ---------------------------------------------------------------------------
-- player_stats v2: + current_streak_weeks (return type changes → drop first).
-- Same gates as 0017: owner or connection only, never across a block.
-- ---------------------------------------------------------------------------
drop function if exists public.player_stats(uuid);

create or replace function public.player_stats(target uuid)
returns table (
  games_played    integer,
  games_hosted    integer,
  games_this_month integer,
  sports_count    integer,
  top_sport       activity_type,
  top_sport_count integer,
  last_played_at  timestamptz,
  current_streak_weeks integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if public.is_blocked(auth.uid(), target) then return; end if;
  if target <> auth.uid() and not public.are_connected(auth.uid(), target) then
    return;
  end if;

  return query
  with played as (
    select a.id, a.activity_type, a.starts_at
    from public.activity_participants ap
    join public.activities a on a.id = ap.activity_id
    where ap.user_id = target
      and ap.status = 'joined'
      and a.status <> 'cancelled'
      and a.starts_at < now()
  )
  select
    (select count(*) from played)::int,
    (select count(*) from public.activities h
      where h.host_id = target and h.status <> 'cancelled' and h.starts_at < now())::int,
    (select count(*) from played p where p.starts_at > now() - interval '30 days')::int,
    (select count(distinct p.activity_type) from played p)::int,
    (select p.activity_type from played p
      group by p.activity_type order by count(*) desc, p.activity_type asc limit 1),
    coalesce((select count(*) from played p
      group by p.activity_type order by count(*) desc, p.activity_type asc limit 1), 0)::int,
    (select max(p.starts_at) from played),
    -- Consecutive weeks with >=1 game, anchored at the most recent active week;
    -- the streak is "current" only if that anchor is this week or last week.
    coalesce((
      select count(*)::int
      from (
        select w.wk,
               row_number() over (order by w.wk desc) - 1 as off,
               max(w.wk) over () as anchor
        from (select distinct date_trunc('week', p.starts_at) as wk from played p) w
      ) t
      where t.anchor >= date_trunc('week', now()) - interval '7 days'
        and t.wk = t.anchor - (t.off * interval '7 days')
    ), 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Head-to-head: games the caller and target were both on.
-- ---------------------------------------------------------------------------
create or replace function public.played_together(target uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null
      or target = auth.uid()
      or public.is_blocked(auth.uid(), target)
    then 0
    else coalesce((
      select count(distinct a.id)::int
      from public.activities a
      join public.activity_participants me
        on me.activity_id = a.id and me.user_id = auth.uid() and me.status = 'joined'
      join public.activity_participants them
        on them.activity_id = a.id and them.user_id = target and them.status = 'joined'
      where a.status <> 'cancelled'
        and a.starts_at < now()
    ), 0)
  end;
$$;
