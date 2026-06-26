# Strive — Production Readiness Roadmap

How we get from the current scaffold to a real app in the App Store / Play Store,
serving real men playing real football in the Surrey beachhead.

**Honest framing:** the code is ~30% of the remaining work. The other ~70% is
accounts, money, legal/safety process, and store review. This document is the
checklist. Work the phases roughly in order — Phases 0–2 are the critical path;
nothing ships without them.

---

## Where we are today

| Area | Status |
|------|--------|
| App shell, navigation, screens (Discover / detail / create / My Games / Profile / chat) | ✅ built |
| DB schema + RLS + PostGIS `nearby_activities` RPC | ✅ written, ⛔ not yet applied to a real project |
| Auth flows (Apple / phone OTP) | 🟡 coded; Google sign-in is a **stub**; none tested against a live provider |
| Chat (Stream client + token Edge Function) | 🟡 coded; needs a Stream app + secret |
| Notifications | 🟡 push registration + send function are **stubs**, not scheduled/triggered |
| Safety (block / report) | 🟡 writes wired; moderation review + "blocked disappears everywhere" not verified |
| Tests / CI / crash reporting | ⛔ none |
| Store build config (EAS) | 🟡 skeleton; empty `projectId`, no credentials |
| Legal (privacy, terms, GDPR, moderation policy) | ⛔ none |

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
- [ ] **Google**: finish the stub in `app/(auth)/sign-in.tsx` + `lib/auth.ts` —
      retrieve a real `id_token` (expo-auth-session / Google sign-in) and exchange it.
      Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID`.
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
- [ ] Create a **Stream Chat** app; set `EXPO_PUBLIC_STREAM_API_KEY`.
- [ ] Deploy `stream-token` Edge Function; `supabase secrets set STREAM_API_KEY/SECRET`.
- [ ] Server-side channel membership sync (don't trust the client to add/remove members).
- [ ] Chat moderation: profanity/abuse handling, report-from-chat, blocked-user hiding.
- [ ] Notifications: deploy `send-notifications`; wire **reminders** via pg_cron/scheduled
      function (~1h before `starts_at`) and **chat nudges** via a Stream webhook.
- [ ] APNs (Apple) + FCM (Android) credentials in Expo.
- **Effort:** ~3–5 days.

## Phase 5 — Observability + quality
- [ ] Crash/error reporting (Sentry) in app + Edge Functions.
- [ ] Lightweight product analytics for the core funnel (sign-up → verify → discover → join → chat).
- [ ] Tests: unit (hooks, `lib/format`, `lib/location`), a few integration tests on
      join/leave/fullness, and RLS policy tests. **There are currently zero tests.**
- [ ] CI (GitHub Actions): typecheck + lint + tests on every PR. Add a SessionStart hook so web sessions can run them.
- [ ] `expo-doctor` clean; pin dependency versions to the SDK.
- **Effort:** ~3–4 days for a meaningful baseline.

## Phase 6 — Legal & safety (start drafting in parallel from week 1)
- [ ] Privacy policy + terms of service (hosted URLs; required by both stores).
- [ ] **GDPR/UK**: lawful basis, data export + account deletion, data-retention policy.
      Account deletion is an **App Store requirement** for accounts.
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
- [ ] `types/database.ts` — regenerate from live schema; drop placeholder + `as unknown as` casts (needs a Supabase project).
- [ ] `supabase/functions/send-notifications` — finish + schedule (pg_cron) + Stream webhook.
- [ ] `lib/stream.ts` — move channel add/remove membership to the server (Edge Function).
- [ ] Loading skeletons on Discover / detail / My Games (empty + error states done).
- [ ] Verify end-to-end that blocked users vanish from discovery + rosters + chat (RLS in place; needs a live DB to confirm).
- [ ] Sentry/crash reporting + product analytics.
- [ ] `eas.json` — real profiles, credentials, `extra.eas.projectId`.
- [ ] More tests: hook-level (join/leave/fullness) + RLS policy tests against a local DB.

---

## Rough cost (recurring unless noted)
- Apple Developer: **$99/yr**. Google Play: **$25 one-off**.
- Supabase: free tier to start; **~$25/mo** Pro when you need it.
- Stream Chat: free dev tier; paid as you grow.
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
