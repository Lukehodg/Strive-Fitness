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

## 2. Stream Chat
1. Create an app at https://getstream.io.
2. Put the **API key** (public) in `.env` as `EXPO_PUBLIC_STREAM_API_KEY`.
3. Deploy the token function and set its secrets (the **secret** stays server-side):
   ```
   supabase functions deploy stream-token
   supabase secrets set STREAM_API_KEY=<key> STREAM_API_SECRET=<secret>
   ```

## 3. Push notifications (Sprint 6)
- Expo push works in dev builds out of the box. Tokens are saved by
  `hooks/usePushNotifications.ts`.
- Deploy `supabase functions deploy send-notifications`. Trigger reminders on a
  schedule (pg_cron / scheduled function) and chat nudges from a Stream webhook.

## 4. Maps
- iOS uses Apple Maps (no key). For Android, add a Google Maps API key under
  `android.config.googleMaps.apiKey` in `app.json`.

## 5. Running
- **Expo Go** is fine for most UI, but native modules (react-native-maps, Apple
  sign-in, Stream) want a **dev build**:
  ```
  npx expo run:ios      # or run:android
  ```
- EAS builds: `eas build --profile development` (see `eas.json`). Fill the build
  `env` or use `eas secret:create` for the public EXPO_PUBLIC_* values.

## Local development with sample data
`supabase db reset` re-applies migrations and `supabase/seed.sql`, which inserts
a few Weybridge-area games so Discover isn't empty.
