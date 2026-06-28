# Setup — wiring up the services

The code is in place; these are the accounts/keys to make it run end to end. You
only strictly need **Supabase + Expo** to boot. Add Stream, Apple, and Google as
you reach those sprints.

## 1. Supabase
1. Create a project at https://supabase.com.
2. Apply the schema:
   - With the CLI: `supabase link --project-ref <ref>` then `supabase db push`.
   - Or paste `supabase/migrations/0001_init.sql` into the SQL editor and run it.
   It enables PostGIS, creates the tables + RLS + triggers, the `nearby_activities`
   RPC, and the public `avatars` storage bucket.
3. Project Settings → API: copy the **Project URL** and the **anon public** key
   into `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
   Never put the service-role key in the app.
4. Generate types: `npm run gen:types` (writes `types/database.ts`).

### Auth providers (Supabase → Authentication → Providers)
- **Phone:** enable Phone auth and connect an SMS provider (e.g. Twilio). This
  gates hosting/joining games.
- **Apple:** enable, set the Services ID / key. The app uses native Apple sign-in.
- **Google:** enable, add your OAuth client. Put the client IDs in `.env`
  (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`) and
  wire the id_token retrieval in `app/(auth)/sign-in.tsx` (see the TODO there).

## 2. Chat
Nothing to set up — chat is built in on Supabase Realtime (`messages` table,
migration 0006). Make sure migration 0006 is applied and the table is in the
`supabase_realtime` publication (the migration does this). Stream Chat was
dropped; there are no third-party keys to configure.

## 3. Push notifications
- Expo push works in dev builds out of the box. Tokens are saved by
  `hooks/usePushNotifications.ts`.
- Deploy `supabase functions deploy send-notifications`. It fires on invite /
  accept / chat / cancel events from the app. Time-based reminders still need a
  schedule (pg_cron) — see `docs/PRODUCTION_ROADMAP.md` Phase 4.

## 4. Strava (Recent activity on profiles)
1. Create an API application at https://www.strava.com/settings/api.
2. **Authorization Callback Domain:** set it to match the app's redirect. For a
   dev/standalone build the redirect is `strive://strava`, so use `strive` as the
   domain. (For Expo Go / web you'll get a different host — check what
   `AuthSession.makeRedirectUri` logs and register that.)
3. Put the **Client ID** (public) in `.env` as `EXPO_PUBLIC_STRAVA_CLIENT_ID` (and
   in `app.json` `extra.stravaClientId` for EAS builds).
4. Keep the **Client Secret** server-side only:
   ```
   supabase secrets set STRAVA_CLIENT_ID=<id> STRAVA_CLIENT_SECRET=<secret>
   supabase functions deploy strava
   ```
5. Apply migration `0010_strava.sql`.
- Privacy: we store **stats only** (distance/time/elevation) — never GPS or
  route — so activities are safe to show on a profile. The "Powered by Strava"
  attribution is required by their brand guidelines (already rendered).

## 5. Apple Health (iOS)
- Provided by `@kingstinct/react-native-healthkit` + its config plugin (already
  wired in `app.json`), which adds the HealthKit entitlement and the
  `NSHealthShareUsageDescription` prompt. **Read-only**; background delivery off.
- Needs a **fresh native build** (`eas build` / `expo run:ios`) — it won't run in
  Expo Go. iOS-only; on Android the section renders nothing.
- Data stays **on-device**: workouts are read live and shown on the owner's
  profile. Nothing is written to Supabase. App Review wants a privacy policy and
  a clear reason for HealthKit use (we read workouts to show recent activity).

## 6. Maps
- iOS uses Apple Maps (no key). For Android, add a Google Maps API key under
  `android.config.googleMaps.apiKey` in `app.json`.

## 7. Running
- **Expo Go** is fine for most UI, but native modules (react-native-maps, Apple
  sign-in, HealthKit) want a **dev build**:
  ```
  npx expo run:ios      # or run:android
  ```
- EAS builds: `eas build --profile development` (see `eas.json`). Fill the build
  `env` or use `eas secret:create` for the public EXPO_PUBLIC_* values.

## Local development with sample data
`supabase db reset` re-applies migrations and `supabase/seed.sql`, which inserts
a few Weybridge-area games so Discover isn't empty.
