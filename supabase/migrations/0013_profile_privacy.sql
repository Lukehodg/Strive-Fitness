-- =============================================================================
-- 0013_profile_privacy.sql — never expose a user's precise location
--
-- `profiles.home_location` is a precise geography point. The app only ever
-- WRITES it (set at profile creation, used server-side for proximity) and never
-- reads it back — but a table-level SELECT grant meant any authenticated user
-- could read ANY profile's exact point. That violates the core privacy rule
-- ("approximate area + distance only").
--
-- Fix with column-level grants: the app role can read every profile column
-- EXCEPT home_location. Inserts/updates (owner only, via RLS) are unaffected,
-- and the service role still sees everything.
-- =============================================================================

revoke select on public.profiles from anon, authenticated;

grant select (
  id, display_name, avatar_url, area_label, phone_verified, bio, created_at, updated_at
) on public.profiles to authenticated;
