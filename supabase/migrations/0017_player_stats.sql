-- =============================================================================
-- 0017_player_stats.sql — player stats + connections leaderboard
--
-- The competitive layer. Two read-only RPCs, both SECURITY DEFINER with
-- explicit gates (no new writable tables):
--
--   * player_stats(target) — games played/hosted, this-month count, sports
--     tried, top sport, last played. Visible to the OWNER and their
--     CONNECTIONS only (either direction of the connections pair), never
--     across a block. Anyone else gets zero rows — the app shows a
--     "play together to unlock" nudge.
--   * connections_leaderboard() — you + your connections ranked by games
--     in the last 30 days (then all-time). Your circle only.
--
-- Privacy note: these are aggregates over rosters that are already visible
-- row-by-row to authenticated users; the friends-gate makes the aggregate view
-- *stricter* than the underlying data, not looser.
-- =============================================================================

-- Friendship is stored one-way ("play again" adds a row); treat it as
-- symmetric: either direction counts.
create or replace function public.are_connected(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.connections
    where (user_id = a and connection_id = b)
       or (user_id = b and connection_id = a)
  );
$$;

create or replace function public.player_stats(target uuid)
returns table (
  games_played    integer,
  games_hosted    integer,
  games_this_month integer,
  sports_count    integer,
  top_sport       activity_type,
  top_sport_count integer,
  last_played_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if public.is_blocked(auth.uid(), target) then return; end if;
  -- Friends-gate: your own stats, or a connection's.
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
    (select max(p.starts_at) from played);
end;
$$;

create or replace function public.connections_leaderboard()
returns table (
  user_id          uuid,
  display_name     text,
  avatar_url       text,
  games_this_month integer,
  games_all_time   integer
)
language sql
stable
security definer
set search_path = public
as $$
  with circle as (
    select auth.uid() as uid
    union
    select c.connection_id from public.connections c where c.user_id = auth.uid()
    union
    select c.user_id from public.connections c where c.connection_id = auth.uid()
  ),
  members as (
    select p.id, p.display_name, p.avatar_url
    from public.profiles p
    join circle on circle.uid = p.id
    where not public.is_blocked(auth.uid(), p.id)
  )
  select
    m.id,
    m.display_name,
    m.avatar_url,
    count(a.id) filter (where a.starts_at > now() - interval '30 days')::int as games_this_month,
    count(a.id)::int as games_all_time
  from members m
  left join public.activity_participants ap
    on ap.user_id = m.id and ap.status = 'joined'
  left join public.activities a
    on a.id = ap.activity_id and a.status <> 'cancelled' and a.starts_at < now()
  group by m.id, m.display_name, m.avatar_url
  order by games_this_month desc, games_all_time desc, m.display_name asc
  limit 50;
$$;
