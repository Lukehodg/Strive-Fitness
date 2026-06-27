-- Curated local races (10Ks / halves) near the Weybridge/Woking beachhead.
-- Run in Supabase -> SQL Editor after 0003/0004. Deterministic ids = re-runnable.
--
-- ⚠️ The race SERIES, venues and links below are real, but exact DATES move
-- year to year and aren't available via a public API. Confirm each date against
-- the organiser and update `starts_at` before showing these to real users.
-- (parkruns + HYROX are handled separately and are accurate.)

insert into public.events
  (id, title, event_type, starts_at, venue_label, location, distance_km, description, external_url, organizer)
values
  (
    md5('runthrough-richmond-park-10k')::uuid,
    'Richmond Park 10K',
    '10k',
    '2026-08-15 09:00:00+00',
    'Richmond Park, Richmond',
    st_setsrid(st_makepoint(-0.2720, 51.4420), 4326),
    10,
    'Chip-timed 10K on the paths of Richmond Park. Monthly RunThrough event — confirm the next date.',
    'https://www.runthrough.co.uk/',
    'RunThrough'
  ),
  (
    md5('runthrough-wimbledon-common-10k')::uuid,
    'Wimbledon Common 10K',
    '10k',
    '2026-10-10 09:00:00+00',
    'Wimbledon Common, London',
    st_setsrid(st_makepoint(-0.2290, 51.4310), 4326),
    10,
    'Off-road 10K across Wimbledon Common. Medal and t-shirt for finishers.',
    'https://www.runthrough.co.uk/',
    'RunThrough'
  ),
  (
    md5('richmond-running-festival-half')::uuid,
    'Richmond Running Festival — Half',
    'half_marathon',
    '2026-09-13 08:30:00+00',
    'Old Deer Park, Richmond',
    st_setsrid(st_makepoint(-0.3080, 51.4690), 4326),
    21.1,
    'Riverside half marathon starting in Old Deer Park, along the Thames towpath.',
    'https://www.richmondrunningfestival.com/',
    'Richmond Running Festival'
  ),
  (
    md5('elmbridge-10k')::uuid,
    'Elmbridge 10K',
    '10k',
    '2027-04-18 09:30:00+00',
    'Walton-on-Thames',
    st_setsrid(st_makepoint(-0.4170, 51.3850), 4326),
    10,
    'Friendly, flat local 10K around Elmbridge — close to home for the Weybridge crew.',
    'https://www.elmbridge10k.co.uk/',
    'Elmbridge Runners'
  ),
  (
    md5('surrey-half-marathon-next')::uuid,
    'Surrey Half Marathon',
    'half_marathon',
    '2027-03-21 09:00:00+00',
    'Woking Park, Woking',
    st_setsrid(st_makepoint(-0.5556, 51.3168), 4326),
    21.1,
    'Fast, flat half marathon on closed roads through Woking. One of Surrey''s biggest.',
    'https://www.surreyhalf.com/',
    'RunThrough'
  )
on conflict (id) do update
  set starts_at = excluded.starts_at, venue_label = excluded.venue_label;
