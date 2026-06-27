-- Example events to populate the Events tab. Safe to run in the hosted SQL
-- editor (unlike seed.sql, this inserts no fake auth users). Dates are relative
-- to when you run it, so they always sit in the future.
--
-- Run this once in Supabase -> SQL Editor after applying 0003_events.sql.

insert into public.events
  (title, event_type, starts_at, venue_label, location, distance_km, description, external_url, organizer)
values
  (
    'Woking parkrun',
    'parkrun',
    date_trunc('week', now()) + interval '5 days 9 hours', -- this Saturday 09:00
    'Woking Park',
    st_setsrid(st_makepoint(-0.5556, 51.3168), 4326),
    5,
    'Free, weekly, timed 5K every Saturday morning. All abilities welcome — run, jog or walk.',
    'https://www.parkrun.org.uk/woking/',
    'parkrun UK'
  ),
  (
    'Richmond parkrun',
    'parkrun',
    date_trunc('week', now()) + interval '5 days 9 hours',
    'Old Deer Park, Richmond',
    st_setsrid(st_makepoint(-0.3080, 51.4690), 4326),
    5,
    'Saturday-morning 5K in Old Deer Park. Flat, fast and friendly.',
    'https://www.parkrun.org.uk/richmond/',
    'parkrun UK'
  ),
  (
    'Surrey 10K',
    '10k',
    now() + interval '24 days 8 hours 30 minutes',
    'Denbies Wine Estate, Dorking',
    st_setsrid(st_makepoint(-0.3380, 51.2360), 4326),
    10,
    'Scenic 10K through the Surrey Hills. Chip-timed, medal for every finisher.',
    'https://example.com/surrey-10k',
    'Surrey Runs'
  ),
  (
    'Surrey Half Marathon',
    'half_marathon',
    now() + interval '52 days 8 hours',
    'Woking town centre',
    st_setsrid(st_makepoint(-0.5590, 51.3190), 4326),
    21.1,
    'A fast, flat half marathon on closed roads through Woking and the surrounding villages.',
    'https://example.com/surrey-half',
    'Surrey Runs'
  ),
  (
    'London Landmarks Marathon',
    'marathon',
    now() + interval '95 days 8 hours',
    'Pall Mall, London',
    st_setsrid(st_makepoint(-0.1330, 51.5060), 4326),
    42.2,
    'A full marathon past London''s iconic landmarks. Ballot and charity places available.',
    'https://example.com/london-marathon',
    'City Events'
  );
