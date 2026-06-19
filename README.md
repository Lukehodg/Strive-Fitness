# Strive

Men-only, activity-first app to connect around real-world **pickup football**.
Activity-first, not profile-first — verification-led for trust and safety.
MVP is one vertical (football) in the Surrey commuter belt. See `CLAUDE.md` for
the full product context and scope guardrails.

## Stack
- **App:** React Native + Expo (managed), TypeScript, Expo Router (file-based)
- **Backend:** Supabase — Postgres + Auth + Realtime + Storage + Edge Functions
- **Geo:** PostGIS (`nearby_activities` RPC) — all distance math in Postgres
- **Chat:** Stream Chat (token minted by an Edge Function)
- **Maps/location:** react-native-maps + expo-location
- **Push:** Expo Notifications
- **Server state:** TanStack Query

## Layout
```
app/                 Expo Router routes
  (auth)/            sign-in, verify-phone, create-profile
  (tabs)/            Discover (index), My Games, Profile
  game/[id].tsx      game detail (join/leave/roster/safety)
  game/create.tsx    create a game
  game/chat/[id].tsx Stream chat for a game
components/           UI kit + GameCard + theme tokens
hooks/                useAuth, useProfile, useNearbyActivities, useActivity, ...
lib/                  supabase client, stream, auth, location, storage, format
types/database.ts     DB types (regenerate with `npm run gen:types`)
supabase/
  migrations/0001_init.sql   schema: tables, RLS, triggers, nearby_activities RPC
  functions/stream-token     mints Stream tokens (keeps the secret server-side)
  functions/send-notifications  Expo push (reminders + chat nudges)
  seed.sql           sample Weybridge games for local dev
```

## Quick start
1. `npm install`
2. Copy `.env.example` to `.env` and fill in Supabase + Stream keys (see `SETUP.md`).
3. Apply the schema: `supabase db push` (or paste `supabase/migrations/0001_init.sql`
   into the SQL editor).
4. Generate types: `npm run gen:types`.
5. `npm start` and open in Expo Go (or a dev build for native maps/Apple sign-in).

## Sprint status
Sprint 1 (scaffold + Supabase wiring) is complete. Sprints 2–5 (auth, discover,
create/join, chat) are implemented against the schema and need provider keys to
go fully live. Sprints 6–7 (notifications, safety polish, EAS/TestFlight) are
scaffolded. Details and what each sprint covers live in `CLAUDE.md` and the build
playbook. **The real risk is liquidity, not code** — fill one recurring game by
hand before leaning on the app.
