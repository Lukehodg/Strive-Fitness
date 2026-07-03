-- =============================================================================
-- 0021_retention_pushes.sql — the proactive hook engine
--
-- Three scheduled pushes that bring people back at the right moment (all via
-- the same Vault + pg_net path as 0011/0018; all best-effort):
--   * weekly_digest   — Monday 08:00: "N games near you this week — your
--                       crew's in M of them." Skipped when there's nothing.
--   * streak_guard    — Thursday 17:00: users with a 2+ week streak and no
--                       game booked before Sunday get a loss-aversion nudge.
--   * rebook_prompts  — ~2h after a game ends, the host gets "Run it back"
--                       (pairs with the app's one-tap rebook + re-invite).
--
-- Plus a shared `push_to_users()` helper. All four functions are EXECUTE-
-- revoked from app roles: they're cron/internal only.
-- =============================================================================

alter table public.activities add column if not exists rebook_prompted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Shared push helper (internal only)
-- ---------------------------------------------------------------------------
create or replace function public.push_to_users(
  uids   uuid[],
  n_title text,
  n_body  text,
  n_data  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url  text;
  svc_key text;
begin
  if uids is null or array_length(uids, 1) is null then return; end if;
  select decrypted_secret into fn_url  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key';
  if fn_url is null or svc_key is null then return; end if;

  perform net.http_post(
    url     := fn_url || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body    := jsonb_build_object(
      'userIds', to_jsonb(uids),
      'title', n_title,
      'body', n_body,
      'data', n_data
    )
  );
exception when others then
  null; -- pushes are a nicety, never an error path
end;
$$;

revoke all on function public.push_to_users(uuid[], text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Monday digest
-- ---------------------------------------------------------------------------
create or replace function public.weekly_digest()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  u      record;
  n_near integer;
  n_crew integer;
  msg    text;
begin
  for u in
    select distinct pt.user_id, p.home_location
    from public.push_tokens pt
    join public.profiles p on p.id = pt.user_id
    where p.suspended_at is null
  loop
    -- Upcoming games this week, near home when we know it.
    select count(*) into n_near
    from public.activities a
    where a.status in ('open', 'full')
      and a.starts_at between now() and now() + interval '7 days'
      and (u.home_location is null or st_dwithin(a.location, u.home_location, 20000));

    -- Games this week with at least one of their connections on the roster.
    select count(distinct a.id) into n_crew
    from public.activities a
    join public.activity_participants ap
      on ap.activity_id = a.id and ap.status = 'joined'
    where a.status in ('open', 'full')
      and a.starts_at between now() and now() + interval '7 days'
      and ap.user_id in (
        select c.connection_id from public.connections c where c.user_id = u.user_id
        union
        select c.user_id from public.connections c where c.connection_id = u.user_id
      );

    if n_near = 0 and n_crew = 0 then continue; end if;

    msg := n_near || case when n_near = 1 then ' game' else ' games' end || ' near you this week';
    if n_crew > 0 then
      msg := msg || ' — your crew''s in ' || n_crew || ' of them';
    end if;

    perform public.push_to_users(
      array[u.user_id], 'This week on Turnout', msg, jsonb_build_object('type', 'discover')
    );
  end loop;
end;
$$;

revoke all on function public.weekly_digest() from public, anon, authenticated;

select cron.unschedule('weekly-digest')
  where exists (select 1 from cron.job where jobname = 'weekly-digest');
select cron.schedule('weekly-digest', '0 8 * * 1', $$ select public.weekly_digest(); $$);

-- ---------------------------------------------------------------------------
-- Streak guard (Thursday evening)
-- ---------------------------------------------------------------------------
create or replace function public.streak_guard()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    with played as (
      select ap.user_id, date_trunc('week', a.starts_at) as wk
      from public.activity_participants ap
      join public.activities a on a.id = ap.activity_id
      where ap.status = 'joined'
        and a.status <> 'cancelled'
        and a.starts_at < now()
      group by 1, 2
    ),
    ranked as (
      select user_id, wk,
             row_number() over (partition by user_id order by wk desc) - 1 as off,
             max(wk) over (partition by user_id) as anchor
      from played
    ),
    streaks as (
      select user_id, count(*)::int as n
      from ranked
      where anchor >= date_trunc('week', now()) - interval '7 days'
        and wk = anchor - (off * interval '7 days')
      group by user_id
      having count(*) >= 2
    ),
    booked as (
      select distinct ap.user_id
      from public.activity_participants ap
      join public.activities a on a.id = ap.activity_id
      where ap.status = 'joined'
        and a.status in ('open', 'full')
        and a.starts_at between now() and date_trunc('week', now()) + interval '7 days'
    )
    select distinct s.user_id, s.n
    from streaks s
    join public.push_tokens pt on pt.user_id = s.user_id
    left join booked b on b.user_id = s.user_id
    where b.user_id is null
  loop
    perform public.push_to_users(
      array[r.user_id],
      '🔥 ' || r.n || '-week streak on the line',
      'No game booked this week yet — find one before Sunday to keep it alive.',
      jsonb_build_object('type', 'discover')
    );
  end loop;
end;
$$;

revoke all on function public.streak_guard() from public, anon, authenticated;

select cron.unschedule('streak-guard')
  where exists (select 1 from cron.job where jobname = 'streak-guard');
select cron.schedule('streak-guard', '0 17 * * 4', $$ select public.streak_guard(); $$);

-- ---------------------------------------------------------------------------
-- "Run it back" prompt to the host, ~2h after full time
-- ---------------------------------------------------------------------------
create or replace function public.rebook_prompts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
begin
  for a in
    select id, host_id, title
    from public.activities
    where status in ('open', 'full')
      and rebook_prompted_at is null
      and starts_at + (duration_minutes || ' minutes')::interval
            between now() - interval '150 minutes' and now() - interval '90 minutes'
  loop
    perform public.push_to_users(
      array[a.host_id],
      'Run it back?',
      a.title || ' just wrapped. Book next week in one tap — same time, same crew.',
      jsonb_build_object('type', 'game', 'activityId', a.id)
    );
    update public.activities set rebook_prompted_at = now() where id = a.id;
  end loop;
end;
$$;

revoke all on function public.rebook_prompts() from public, anon, authenticated;

select cron.unschedule('rebook-prompts')
  where exists (select 1 from cron.job where jobname = 'rebook-prompts');
select cron.schedule('rebook-prompts', '*/30 * * * *', $$ select public.rebook_prompts(); $$);
