-- Optional local seed: a handful of Weybridge-area games so Discover isn't empty
-- during development. Runs after migrations on `supabase db reset`.
--
-- Creates two throwaway auth users + profiles, then a few football games around
-- the Surrey commuter belt. Coordinates are POINT(lng lat).

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'host1@example.com', '{}'),
  ('22222222-2222-2222-2222-222222222222', 'host2@example.com', '{}')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, area_label, phone_verified, home_location)
values
  ('11111111-1111-1111-1111-111111111111', 'Sample Sam', 'Weybridge', true,
    st_setsrid(st_makepoint(-0.4488, 51.3743), 4326)),
  ('22222222-2222-2222-2222-222222222222', 'Demo Dan', 'Woking', true,
    st_setsrid(st_makepoint(-0.5580, 51.3190), 4326))
on conflict (id) do nothing;

insert into public.activities
  (host_id, title, venue_label, location, starts_at, duration_minutes, max_players)
values
  ('11111111-1111-1111-1111-111111111111', 'Sunday 5-a-side', 'Weybridge Sports Hub',
    st_setsrid(st_makepoint(-0.4488, 51.3743), 4326), now() + interval '2 days', 60, 10),
  ('11111111-1111-1111-1111-111111111111', 'Wednesday kickabout', 'Brooklands 3G',
    st_setsrid(st_makepoint(-0.4700, 51.3480), 4326), now() + interval '4 days', 90, 14),
  ('22222222-2222-2222-2222-222222222222', 'Woking 7-a-side', 'Woking Leisure Centre',
    st_setsrid(st_makepoint(-0.5580, 51.3190), 4326), now() + interval '3 days', 60, 14);
