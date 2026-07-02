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
- **Chat:** built-in, on Supabase Realtime (`messages` table + postgres_changes).
  Stream Chat was dropped (see 0006). Do not re-add a third-party chat SDK.
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
- The **networking** vertical (data model supports it; UI does not surface it).
  NOTE: the owner has since broadened the *sport* set — football, running,
  cycling, gym, tennis, padel, basketball are now live activity types (0009).
  This supersedes the original football-only MVP framing above.
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

### Hardening pass (post-Sprint scaffold)
- Google sign-in implemented (expo-auth-session id_token exchange).
- Migration `0002`: `nearby_activities` returns venue lat/lng (map markers on real
  games); `participants_select` tightened (was world-readable) to respect blocks.
- `ErrorBoundary` around the app root; push registration mounted; create-profile
  is scroll/keyboard-safe; safe boot when `.env` is missing (`isSupabaseConfigured`).
- Test suite (jest-expo, 22 tests), ESLint, and GitHub Actions CI — all green
  (`npm run typecheck && npm run lint && npm test`).
- `expo-asset`/`expo-font` added so the app bundles on a clean install (verified
  via `expo export --platform ios`).
- Next: see `docs/PRODUCTION_ROADMAP.md` for the path to store launch.

### Feature passes (post-hardening, broadened to football + running events)
- Stride brand theme; Events tab (parkruns/races/HYROX) + "I'm going" RSVP.
- **Recurring games** (`0007`), **built-in Realtime chat** (`0006`, Stream dropped),
  **format/skill + Discover filters** (`0007`), **connections** screen.
- **Invites + notifications** (`0008`): invite a connection into a game; invitee
  inbox with accept/decline (accept joins the roster). Event-driven push via the
  `send-notifications` Edge Function (invite / accepted / chat / cancelled), now
  JWT-authenticated and membership-gated. Tap-to-deep-link wired. Time-based
  reminders still need pg_cron — see roadmap Phase 4.
- **Multi-sport** (`0009`): `activity_type` extended (running/cycling/tennis/padel/
  basketball added to football+gym); Discover filters by **sport** (icon chips),
  Create has a sport picker (football keeps format/skill, others hide them), and
  `nearby_activities` returns every sport + its `activity_type`. `lib/sports.ts`
  holds the sport list/labels/icons.
- **Strava integration** (`0010`): "Recent activity" on the profile. OAuth
  authorize via expo-auth-session; the `strava` Edge Function does the secret-side
  token exchange/refresh + activity fetch with the service role. `strava_accounts`
  hides tokens from the app role via column grants; `strava_activities` stores
  **stats only — no GPS/route** (privacy), readable by others (minus blocks) for
  future public profiles. Needs `EXPO_PUBLIC_STRAVA_CLIENT_ID` +
  `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` secrets (see SETUP.md).
- **Apple Health** (iOS): `@kingstinct/react-native-healthkit` (+ config plugin).
  Read-only workouts shown on the profile, **on-device only — never stored
  server-side** (keeps health data out of GDPR special-category storage).
  `HealthSection.ios.tsx` is the real impl; `HealthSection.tsx` is a no-op stub
  for other platforms (Metro picks per platform). Needs a native rebuild.
- **GDPR groundwork:** the `account` Edge Function does **data export** (JSON
  bundle) and **account deletion** (deletes the auth user → cascades all tables;
  best-effort Strava deauth + avatar cleanup). Profile → "Privacy & data" surfaces
  export, delete, and Privacy/Terms links (`lib/legal.ts`). Starter policy in
  `docs/PRIVACY.md`. In-app deletion is also an App Store requirement.
- **Waitlist** (`0015`): full games queue on `activity_waitlist`; a DB trigger
  auto-promotes the earliest entry when a spot opens (+ push via pg_net/Vault,
  as 0011). Roster inserts/updates are now capacity-checked in RLS (was UI-only).
  Detail screen shows "#N on the waitlist" + join/leave-waitlist actions.
- **Unread chat + host kick** (`0016`): `chat_reads` read-markers + a one-shot
  `unread_counts()` RPC power badges (My Games tab badge, per-game "N NEW
  MESSAGES" pill, "Open chat (n new)"); chat stamps itself read while open.
  Hosts can remove a player (delete policy; not a ban — block for that), which
  waitlist-promotes the next in line. Theme polish: WCAG-fixed `textMuted`,
  marigold full-stop on screen headings (wordmark echo), primary-CTA lift.
- **Player stats + leaderboard** (`0017`): competitive layer. `player_stats(target)`
  RPC (friends-gated: owner or connection only, blocks respected) powers stat
  tiles on your own Profile and on the new `/user/[id]` player screen (basics
  public; stats + recent Strava training locked behind connection).
  `connections_leaderboard()` ranks your circle by games this month — shown atop
  Connections. Rosters and connections rows link to player profiles.
- **Rally + check-ins + badges** (`0018`): "Rally the crew" bulk-invites every
  not-yet-in connection from the invite screen (one upsert, one push). A second
  pg_cron job sends "Still in for tomorrow?" ~24h before kickoff (drop-outs free
  spots to the waitlist). `player_stats` gained `current_streak_weeks`;
  `lib/badges.ts` derives achievement chips (nothing stored) shown via
  `BadgeRow` on profiles (own profile shows the next locked one).
  `played_together(target)` powers a head-to-head pill on player profiles.
- **Dark mode:** palette resolved once at launch from the system setting
  (`Appearance.getColorScheme()` in `components/theme.ts` — static StyleSheets,
  so an OS theme flip applies on next app open; deliberate trade-off). Warm
  "night game" dark set; marigold unchanged. `userInterfaceStyle: "automatic"`
  is a native setting → ships with the next build. Status bar, keyboards,
  avatar initial pairs are scheme-aware; chat bubbles gained timestamps; cards
  press-scale.
- **Production hardening:** pg_cron reminders (`0011`), jittered map pins (`0012`),
  `home_location` column-revoked (`0013`, see `docs/RLS_POLICY_CHECKLIST.md`),
  **Sentry** (app + Edge Functions via `_shared/sentry.ts`), **moderation** (`0014`:
  `suspended_at`/`is_moderator`, suspension enforced in insert RLS; `moderation`
  Edge Function for report triage + suspend), and **PostHog** funnel analytics
  (`lib/analytics.ts`, fetch-based, no SDK). All gated behind their config keys.

See `README.md`, `SETUP.md`, and `docs/PRODUCTION_ROADMAP.md`.
