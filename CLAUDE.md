# CLAUDE.md — Project Context

## What we're building
A mobile app for men to connect around real-world activities: pickup football, gym
sessions, and career networking. Activity-first, not profile-first — people connect
around a *thing they're doing*, not by browsing profiles. Men-only, platonic,
verification-led for trust and safety.

**MVP launches on ONE vertical: pickup football.** Gym and networking are activity
*types* we switch on later using the same data model. Do not build them yet.

**Beachhead:** Surrey commuter-belt (Weybridge/Woking area), men ~25–40. We win one
dense area before expanding anywhere else.

## The core loop (everything serves this)
1. Sign up + verify (phone + Apple/Google)
2. Discover football games near me (map + list, proximity-ranked)
3. Join a game → land in that game's group chat
4. Get reminders + chat notifications
5. After the game: "play again?" / add a mate, so connections persist

## Tech stack (do not deviate without asking)
- **App:** React Native + Expo (managed workflow, EAS Build). TypeScript.
- **Navigation:** Expo Router (file-based).
- **Backend:** Supabase — Postgres + Auth + Realtime + Storage + Edge Functions.
- **Geo:** PostGIS in Postgres for all "near me" proximity queries. Never hand-roll
  distance math in JS.
- **Auth:** Supabase Auth — Apple, Google, and phone (OTP) verification.
- **Chat:** Stream Chat (getstream.io) for MVP. Do not build chat from scratch.
- **Maps:** react-native-maps + expo-location.
- **Push:** Expo Notifications.
- **Payments:** none in MVP. RevenueCat later — do not add billing yet.
- **State/data:** TanStack Query for server state. Avoid Redux unless justified.

## Conventions
- TypeScript strict mode on. No `any` without a comment justifying it.
- Supabase access goes through a typed client + generated types
  (`supabase gen types typescript`). Keep types in sync with the schema.
- All database access is protected by Row Level Security (RLS). No table ships
  without an RLS policy. Never use the service-role key in the app.
- Keep components small and screens thin; push logic into hooks (`/hooks`) and
  data functions (`/lib`).
- Folder shape: `app/` (routes), `components/`, `hooks/`, `lib/`, `types/`,
  `supabase/` (migrations + functions).
- Every new table/column change is a migration file in `supabase/migrations`,
  never a manual edit in the dashboard.

## Hard scope guardrails — DO NOT build these in MVP
- Gym or networking verticals (data model supports them; UI does not surface them yet)
- In-app payments / subscriptions
- Friend graph / following / feed
- Multiple cities or geographic expansion logic
- Web app
- AI matching / recommendations
Anything on this list = "later." If a task drifts toward these, stop and flag it.

## Non-negotiables (safety)
- Block + report on every user and every chat, from day one.
- Phone verification is a feature, not an afterthought — gate joining games behind it.
- Never expose another user's exact location or phone number. Show approximate
  area + distance only.

## How I want you to work
- Work in small, reviewable steps. Show the plan before large multi-file changes.
- Prefer editing existing files over creating parallel new ones.
- After schema changes, regenerate types and update affected queries in the same pass.
- When a requirement is ambiguous, ask rather than invent it.

---

## Implementation status (kept current as sprints land)
- **Sprint 1 — Scaffold + Supabase wired up:** ✅ done. Expo Router tab shell
  (Discover / My Games / Profile), typed Supabase client in `lib/`, env loaded via
  `app.config.ts` + `expo-constants`, TanStack Query provider at the root,
  `types/database.ts` placeholder, and `supabase/migrations/0001_init.sql` with the
  full football-vertical schema (PostGIS, RLS, `nearby_activities` RPC).
- **Sprint 2 — Auth + phone + profile:** scaffolded — Apple/Google/phone-OTP flows,
  create-profile screen, session persistence, auth gate. Provider keys required to
  go live.
- **Sprint 3 — Discover:** scaffolded against the `nearby_activities` RPC (list + map).
- **Sprint 4 — Create / join / leave:** scaffolded against `activities` /
  `activity_participants` with verification gating.
- **Sprint 5 — Chat:** Stream Chat client + `stream-token` Edge Function scaffolded.
- **Sprints 6–7 — Notifications / safety / EAS:** schema + Edge Function stubs in place.

See `README.md` and `SETUP.md` for how to wire up Supabase, Stream, and Expo keys.
