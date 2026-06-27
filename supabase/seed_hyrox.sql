-- Real upcoming UK HYROX races (2026 calendar). Run AFTER 0004 (which adds the
-- 'hyrox' event type). Deterministic ids = safe to re-run. Update/extend as the
-- official calendar (hyrox.com) confirms more UK dates.

insert into public.events
  (id, title, event_type, starts_at, venue_label, location, distance_km, description, external_url, organizer)
values
  (
    md5('hyrox-birmingham-nec-2026')::uuid,
    'HYROX Birmingham',
    'hyrox',
    '2026-10-31 09:00:00+00',
    'The NEC, Birmingham',
    st_setsrid(st_makepoint(-1.7177, 52.4520), 4326),
    null,
    'The fitness race for every body: 8 x 1km runs paired with 8 functional workout stations. Singles, doubles and relays.',
    'https://hyrox.com/event/hyrox-birmingham/',
    'HYROX'
  ),
  (
    md5('hyrox-london-excel-2026')::uuid,
    'HYROX London (ExCeL)',
    'hyrox',
    '2026-12-05 09:00:00+00',
    'ExCeL London, Royal Victoria Dock',
    st_setsrid(st_makepoint(0.0294, 51.5081), 4326),
    null,
    'EMEA''s biggest HYROX — 8 x 1km runs with 8 functional stations under one roof at ExCeL.',
    'https://hyrox.com/event/hyrox-london-excel/',
    'HYROX'
  )
on conflict (id) do update
  set starts_at = excluded.starts_at, venue_label = excluded.venue_label;
