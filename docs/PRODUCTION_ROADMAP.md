# Strive — Production Readiness Roadmap

How we get from the current scaffold to a real app in the App Store / Play Store,
serving real men playing real football in the Surrey beachhead.

**Honest framing:** the code is ~30% of the remaining work. The other ~70% is
accounts, money, legal/safety process, and store review. This document is the
checklist. Work the phases roughly in order — Phases 0–2 are the critical path;
nothing ships without them.

---

## Where we are today

> **Big caveat:** everything below is verified by typecheck / lint / 33 jest
> tests / iOS bundle export — but **not yet run on a device against a live
> backend.** That end-to-end pass is the single most important remaining step.

| Area | Status |
|------|--------|
| App shell, navigation, screens (Discover / Nearby / Events / detail / create / My Games / Profile / chat) | ✅ built |
| DB schema + RLS + PostGIS RPC (migrations `0001`–`0013`) | ✅ written, ⛔ not yet applied to a real project |
| Multi-sport (football/run/cycle/gym/tennis/padel/basketball) | ✅ built |
| Auth flows (Apple / Google / phone OTP) | 🟡 coded incl. Google id_token; none tested against a live provider |
| Chat (built-in Supabase Realtime) | ✅ built (Stream dropped) |
| Notifications (invite/accept/chat/cancel + **pg_cron reminders**) | ✅ coded; needs functions deployed + APNs creds + Vault secrets |
| Connections / invites | ✅ built |
| Strava (privacy-safe profile activity) | ✅ built; needs Strava app + secrets |
| Apple Health (iOS, on-device) | ✅ built; needs a native rebuild |
| Privacy hardening (home_location revoked, **jittered map pins**) | ✅ coded (`0012`/`0013`) |
| GDPR (data export + account deletion) | ✅ built; deploy `account` fn + host policy |
| Crash reporting (Sentry) | ✅ wired; no-op until DSN set |
| Tests / CI | ✅ 33 tests + GitHub Actions |
| Safety (block / report) | 🟡 writes wired; moderation **review process** + end-to-end "blocked disappears everywhere" not verified on live DB |
| Store build config (EAS) | 🟡 `projectId` set, `preview` profile ready; no store credentials yet |
| Legal (privacy, terms, moderation policy) | 🟡 `docs/PRIVACY.md` draft + in-app export/delete; needs hosting + legal review + moderation SLA |

> **Liquidity reality check (Phase 0, runs in parallel with everything):** a
> production app over an empty pitch is still empty. Keep filling one recurring
> Surrey game by hand (WhatsApp + landing page) the entire time you build. If you
> can't fill one game manually, stop and fix that first.

---

## Critical path at a glance

```
Phase 1  Backend live (Supabase)         ──┐
Phase 2  Auth real (Apple/Google/SMS)      ├─ nothing works without these
                                           │   SMS A2P registration is the
Phase 6  Legal + moderation               ─┘   slowest lead-time item — start early
Phase 3  Core-loop hardening
Phase 4  Chat + notifications
Phase 5  Observability + tests + CI
Phase 7  Store builds + submission
Phase 8  Closed beta → Surrey launch
```

The two things with the longest external lead time — **UK SMS/A2P registration**
and **App Store review of a men-only social app** — should be started in week 1,
not at the end.

---

## Phase 0 — Prove liquidity (non-code, ongoing)
- [ ] Keep one recurring Weybridge/Woking game full by hand every week.
- [ ] Collect a waitlist (the people in that game are your first cohort).
- [ ] Only build features the real game actually needs.

## Phase 1 — Backend live
- [ ] Create a Supabase **production** project (and a separate **staging** one).
- [ ] Apply `supabase/migrations/0001_init.sql` (`supabase db push`).
- [ ] Regenerate real types: `npm run gen:types` → replaces the placeholder
      `types/database.ts`. Remove the `as unknown as` casts in `hooks/useActivity.ts`
      and `hooks/useMyGames.ts` once embeds type properly.
- [ ] Put `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` in `.env` (and EAS secrets).
- [ ] **RLS security pass** before any real data:
  - `participants_select` is currently `using (true)` → every roster is readable
    by any signed-in user. Decide: members-only? Tighten it.
  - Confirm phone/exact-location are never returned to other users (spec requirement).
  - Add a `pg` test or manual checklist proving each policy.
- **Effort:** ~1 day code + the account setup.

## Phase 2 — Auth for real (longest external lead time)
- [ ] **SMS provider** for phone OTP (Twilio/MessageBird). Connect to Supabase Auth → Phone.
  - [ ] **UK A2P / sender ID / 10DLC-equivalent registration** — start now; can take days–weeks.
  - [ ] Budget per-SMS cost; add basic rate-limiting / abuse protection on OTP sends.
- [ ] **Apple**: Sign in with Apple (Services ID + key); test on a device build.
- [x] **Google**: `id_token` sign-in implemented via expo-auth-session
      (`GoogleSignInButton` in `app/(auth)/sign-in.tsx`). Just set
      `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID` to enable.
- [ ] Verify the auth gate edge cases: first-run → create-profile, returning user,
      phone-linking to an existing Apple/Google account, session refresh, sign-out.
- **Effort:** ~2–3 days code; **SMS registration is the schedule risk.**

## Phase 3 — Core-loop hardening (Sprint 7)
- [ ] Error boundaries + friendly fallback screens.
- [ ] Loading skeletons + empty states across Discover / detail / My Games.
- [ ] **Blocked users truly disappear** from discovery *and* rosters *and* chat — verify end to end.
- [ ] **Map privacy fix:** `app/(tabs)/index.tsx` currently pins every game on the
      *user's* location. Production needs per-game **approximate** coordinates
      (jittered / snapped to a ~250m grid) returned by the RPC — never the exact venue pin of a private host.
- [ ] Mount `hooks/usePushNotifications.ts` (it exists but is never called).
- [ ] Make `create-profile` scrollable; validate inputs; handle avatar upload failures.
- [ ] "Play again" / connections flow finished and reachable post-game.
- **Effort:** ~3–4 days.

## Phase 4 — Chat + notifications
- [x] **Chat** is built-in on Supabase Realtime (`messages` table, 0006) — Stream dropped.
- [x] **Event notifications** fire from the app via `send-notifications`: game invite,
      invite accepted, new chat message, game cancelled. The function authenticates the
      caller and gates roster-wide sends on membership.
- [ ] Deploy `send-notifications` and confirm `SUPABASE_SERVICE_ROLE_KEY` is set on it.
- [x] **Reminders** (~1h before `starts_at`): migration `0011` adds a pg_cron job
      (`send_due_reminders`) that posts to `send-notifications` via pg_net. The
      function treats a service-role bearer as a trusted call. **Setup:** enable
      pg_cron/pg_net and add Vault secrets `project_url` + `service_role_key`.
- [ ] Chat moderation: profanity/abuse handling, report-from-chat, blocked-user hiding.
- [ ] APNs (Apple) + FCM (Android) credentials in Expo.
- **Effort:** ~1–2 days (store push creds + moderation).

## Phase 5 — Observability + quality
- [x] Crash/error reporting (Sentry) in the **app** (`Sentry.init` + `Sentry.wrap`,
      no-op until `EXPO_PUBLIC_SENTRY_DSN` is set, no PII). _Still TODO: Sentry in
      the Edge Functions, and the build-time config plugin for source maps._
- [ ] Lightweight product analytics for the core funnel (sign-up → verify → discover → join → chat).
- [x] Tests: **33** (jest-expo) across formatters, location, activity-format,
      GameCard, Strava. _Still TODO: hook-level join/leave/fullness + RLS policy tests._
- [x] CI (GitHub Actions): typecheck + lint + tests.
- [ ] `expo-doctor` clean; pin dependency versions to the SDK.
- **Effort:** ~1–2 days (analytics + Edge Function Sentry + more tests).

## Phase 6 — Legal & safety (start drafting in parallel from week 1)
- [ ] Privacy policy + terms of service (hosted URLs; required by both stores).
      Draft in `docs/PRIVACY.md`; point `lib/legal.ts` at the hosted versions.
- [x] **GDPR data rights**: in-app **data export** (JSON) + **account deletion**
      (cascades all tables) via the `account` Edge Function. Deploy it.
      _Still TODO: lawful-basis register + retention policy (process, not code)._
- [ ] Age gate (18+) and clear men-only / platonic policy + enforcement stance.
- [ ] **Moderation workflow**: who reviews `reports`, SLA, ability to suspend/ban,
      audit trail. A men-only social app **will** be asked how it keeps users safe.
- [ ] Support email + abuse-report contact.
- **Effort:** mostly your time + possibly legal review; not code-heavy but blocking.

## Phase 7 — Store builds + submission
- [ ] Finish `eas.json` + `app.json` (real `projectId`, bundle IDs, icons/splash, Maps key).
- [ ] `eas build` → **TestFlight** (iOS) and **Play internal testing** (Android).
- [ ] Store listings: screenshots, descriptions, age rating, data-safety forms.
- [ ] Submit; expect review friction on the men-only/verification angle — have the
      safety + moderation story ready.
- **Effort:** ~2–3 days + review wait (days–weeks, iterate on rejections).

## Phase 8 — Closed beta → Surrey launch
- [ ] Onboard the hand-filled Phase-0 cohort via TestFlight/Play internal.
- [ ] Watch the funnel; fix the biggest drop-off; tune notification timing.
- [ ] Public launch **only in the beachhead**. Do not add cities (scope guardrail).

---

## Engineering backlog (specific, file-referenced)

**Done in the hardening pass:**
- [x] `app/(auth)/sign-in.tsx` — Google `id_token` sign-in via expo-auth-session.
- [x] `app/(tabs)/index.tsx` + migration `0002` — `nearby_activities` returns venue
      lat/lng; map markers land on real games.
- [x] `0002` — tightened `participants_select` (was world-readable) to respect
      visibility + blocks.
- [x] `hooks/usePushNotifications.ts` — mounted behind the auth gate.
- [x] `components/ErrorBoundary.tsx` — wraps the app root.
- [x] Test suite (jest-expo, 22 tests) + ESLint + GitHub Actions CI.
- [x] Config-missing crash fixed (`lib/env.ts` placeholders + `isSupabaseConfigured`).
- [x] `expo-asset`/`expo-font` added so the app bundles on a clean install.

**Still open:**
- [ ] **Run it on a device against the live backend** — the whole loop, end to end. Nothing here has been.
- [ ] `types/database.ts` — regenerate from the live schema; drop the placeholder + `as unknown as` casts (needs a Supabase project).
- [ ] Deploy the Edge Functions: `send-notifications`, `strava`, `account`; set their secrets.
- [ ] Verify end-to-end that blocked users vanish from discovery + rosters + chat (RLS in place — see `docs/RLS_POLICY_CHECKLIST.md`; needs a live DB).
- [ ] Product analytics + Sentry in the Edge Functions.
- [ ] EAS store credentials (APNs/FCM) + store listings + data-safety forms (disclose Strava/HealthKit).
- [ ] More tests: hook-level (join/leave/fullness) + RLS policy tests against a local DB.
- [ ] Moderation workflow for `reports` (who reviews, SLA, ban/suspend, audit trail).

---

## Rough cost (recurring unless noted)
- Apple Developer: **$99/yr**. Google Play: **$25 one-off**.
- Supabase: free tier to start; **~$25/mo** Pro when you need it (chat is built-in here, no Stream bill).
- SMS (Twilio): **per-message** — the main variable cost; verification is gated behind it.
- Sentry/analytics: free tiers to start.
- Maps: Google Maps API (Android) — free tier likely enough early.
- Optional: legal review of policies.

## Biggest risks
1. **Liquidity** — the app doesn't create demand. Phase 0 must succeed first.
2. **SMS/A2P lead time** — start registration immediately; it blocks the core loop.
3. **App Store review** of a men-only social app — safety/moderation must be real and demonstrable.
4. **Safety incidents** — one bad actor without a working moderation process is an existential/PR risk. Block+report+review is non-negotiable from day one.

---

*Recommended next code step (no accounts required): Phase 3 hardening + Phase 5
test/CI baseline — both can land before any external account exists.*
