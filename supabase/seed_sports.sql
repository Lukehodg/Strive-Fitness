-- =============================================================================
-- seed_sports.sql — sample non-football activities so the new sport filter has
-- data to show. Run in Supabase -> SQL Editor AFTER migration 0009_sports.sql.
--
-- Deterministic md5 ids = safe to re-run (on conflict do nothing).
-- Hosted by your own profile (the oldest profile row), so they appear in
-- Discover hosted by you — fine for a demo. Delete them any time with the
-- statement at the bottom.
--
-- ⚠️ Dates are set just ahead of late-June 2026. If you're seeding later than
-- the times below, bump `starts_at` so they're still in the future (the feed
-- only returns upcoming activities).
-- =============================================================================

insert into public.activities
  (id, host_id, activity_type, title, venue_label, location, starts_at, duration_minutes, max_players, notes)
select v.id, h.id, v.activity_type, v.title, v.venue_label, v.location,
       v.starts_at, v.duration_minutes, v.max_players, v.notes
from (
  values
    (
      md5('seed-running-weybridge-riverside')::uuid,
      'running'::activity_type,
      'Riverside easy 5K',
      'Weybridge Old Town',
      st_setsrid(st_makepoint(-0.4480, 51.3740), 4326)::geography,
      timestamptz '2026-06-30 18:30:00+00',
      45, 15,
      'Relaxed 5K along the Wey. All paces — nobody left behind.'
    ),
    (
      md5('seed-cycling-brooklands-loop')::uuid,
      'cycling'::activity_type,
      'Sunday Surrey Hills loop',
      'Brooklands, Weybridge',
      st_setsrid(st_makepoint(-0.4680, 51.3480), 4326)::geography,
      timestamptz '2026-07-05 08:00:00+00',
      120, 12,
      '~40km steady road ride into the Surrey Hills. Café stop halfway.'
    ),
    (
      md5('seed-gym-weybridge-push')::uuid,
      'gym'::activity_type,
      'Push day + spot',
      'PureGym Weybridge',
      st_setsrid(st_makepoint(-0.4625, 51.3705), 4326)::geography,
      timestamptz '2026-06-29 19:00:00+00',
      75, 6,
      'Chest/shoulders/tris. Happy to spot — all levels welcome.'
    ),
    (
      md5('seed-tennis-st-georges-hill')::uuid,
      'tennis'::activity_type,
      'Doubles, anyone?',
      'St George''s Hill, Weybridge',
      st_setsrid(st_makepoint(-0.4490, 51.3590), 4326)::geography,
      timestamptz '2026-07-02 18:00:00+00',
      90, 4,
      'Friendly doubles. Bring balls if you can.'
    ),
    (
      md5('seed-padel-walton')::uuid,
      'padel'::activity_type,
      'Padel social',
      'Walton-on-Thames',
      st_setsrid(st_makepoint(-0.4160, 51.3870), 4326)::geography,
      timestamptz '2026-07-03 19:30:00+00',
      90, 4,
      'Mixed-ability padel. Rackets available to borrow.'
    ),
    (
      md5('seed-basketball-woking')::uuid,
      'basketball'::activity_type,
      'Pickup hoops',
      'Woking Leisure Centre',
      st_setsrid(st_makepoint(-0.5560, 51.3190), 4326)::geography,
      timestamptz '2026-07-04 17:00:00+00',
      90, 10,
      'Half-court runs, first to 21. Just turn up.'
    )
) as v(id, activity_type, title, venue_label, location, starts_at, duration_minutes, max_players, notes)
cross join (select id from public.profiles order by created_at asc limit 1) as h
on conflict (id) do nothing;

-- To remove the samples later:
-- delete from public.activities where id in (
--   md5('seed-running-weybridge-riverside')::uuid,
--   md5('seed-cycling-brooklands-loop')::uuid,
--   md5('seed-gym-weybridge-push')::uuid,
--   md5('seed-tennis-st-georges-hill')::uuid,
--   md5('seed-padel-walton')::uuid,
--   md5('seed-basketball-woking')::uuid
-- );
