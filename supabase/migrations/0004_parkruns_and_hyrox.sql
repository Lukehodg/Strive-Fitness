-- =============================================================================
-- 0004_parkruns_and_hyrox.sql
--
--  * Add 'hyrox' to event_type.
--  * Curated parkrun venues + refresh_parkruns(): parkruns recur every Saturday
--    at 09:00, so instead of scraping we generate the next few occurrences into
--    `events` from a static venue list. Re-run weekly (or schedule via pg_cron).
--  * Clean out the earlier placeholder events.
-- =============================================================================

alter type event_type add value if not exists 'hyrox';

-- Remove the placeholder events seeded during development.
delete from public.events where event_type = 'parkrun';
delete from public.events where external_url like '%example.com%';

-- ---------------------------------------------------------------------------
-- Curated parkrun venues (real locations near the Weybridge/Woking beachhead).
-- Coordinates are approximate — fine for distance ranking; tune if needed.
-- ---------------------------------------------------------------------------
create table if not exists public.parkrun_venues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  venue_label  text not null,
  location     geography(Point, 4326) not null,
  external_url text not null
);

insert into public.parkrun_venues (name, venue_label, location, external_url) values
  ('Woking parkrun',       'Woking Park, Woking',            st_setsrid(st_makepoint(-0.5556, 51.3168), 4326), 'https://www.parkrun.org.uk/woking/'),
  ('Painshill parkrun',    'Painshill Park, Cobham',         st_setsrid(st_makepoint(-0.4170, 51.3270), 4326), 'https://www.parkrun.org.uk/painshill/'),
  ('Bushy parkrun',        'Bushy Park, Teddington',         st_setsrid(st_makepoint(-0.3350, 51.4160), 4326), 'https://www.parkrun.org.uk/bushy/'),
  ('Nonsuch parkrun',      'Nonsuch Park, Cheam',            st_setsrid(st_makepoint(-0.2360, 51.3550), 4326), 'https://www.parkrun.org.uk/nonsuch/'),
  ('Richmond parkrun',     'Old Deer Park, Richmond',        st_setsrid(st_makepoint(-0.3080, 51.4690), 4326), 'https://www.parkrun.org.uk/richmond/'),
  ('Frimley Lodge parkrun','Frimley Lodge Park, Camberley',  st_setsrid(st_makepoint(-0.7300, 51.3200), 4326), 'https://www.parkrun.org.uk/frimleylodge/'),
  ('Bedfont Lakes parkrun','Bedfont Lakes Country Park',     st_setsrid(st_makepoint(-0.4170, 51.4430), 4326), 'https://www.parkrun.org.uk/bedfontlakes/'),
  ('Crane Park parkrun',   'Crane Park, Whitton',            st_setsrid(st_makepoint(-0.3620, 51.4430), 4326), 'https://www.parkrun.org.uk/cranepark/')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- refresh_parkruns(weeks): upsert the next `weeks` Saturday-09:00 occurrences
-- for every venue into `events`. Deterministic ids (md5 of name+date) so it's
-- idempotent — safe to re-run as often as you like. Returns rows written.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_parkruns(weeks int default 5)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  wk int;
  occ timestamptz;
  this_sat timestamptz := date_trunc('week', now()) + interval '5 days 9 hours'; -- Sat 09:00
  n int := 0;
begin
  -- drop parkrun occurrences that are now in the past
  delete from public.events where event_type = 'parkrun' and starts_at < now();

  for v in select * from public.parkrun_venues loop
    for wk in 0..weeks - 1 loop
      occ := this_sat + (wk * interval '7 days');
      continue when occ <= now();
      insert into public.events
        (id, title, event_type, starts_at, venue_label, location, distance_km, description, external_url, organizer)
      values (
        md5(v.name || occ::text)::uuid,
        v.name,
        'parkrun',
        occ,
        v.venue_label,
        v.location,
        5,
        'Free, weekly, timed 5K. Turn up Saturday at 9am — run, jog or walk, all abilities welcome.',
        v.external_url,
        'parkrun UK'
      )
      on conflict (id) do update
        set starts_at = excluded.starts_at, venue_label = excluded.venue_label;
      n := n + 1;
    end loop;
  end loop;
  return n;
end;
$$;

-- Populate now.
select public.refresh_parkruns();

-- ---------------------------------------------------------------------------
-- Optional: auto-refresh weekly (needs the pg_cron extension enabled).
--   select cron.schedule('refresh-parkruns', '0 5 * * 1',
--                         $$ select public.refresh_parkruns(); $$);
-- ---------------------------------------------------------------------------
