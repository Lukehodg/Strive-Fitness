# Connect Strive Coach to real data

Implementation plan · 29 September 2026

## Implementation status

First backend slice implemented: shared Zod contracts, additive `0004_serious_talon` migration, immutable recommendation snapshots, repeatable-read context capture, existing lighter-set policy adapter, authenticated create/detail/Today APIs and integration tests. Requests use an explicitly selected owned template until dated scheduling ships. Retry keys preserve the original proposal; changed inputs, expiry and unavailable templates mark it stale. GET requests do not create recommendations. Limiting symptoms and missing check-ins return no actionable proposal. Duration estimates remain unknown.

The connected mobile journey now uses these records: Today and Train open real previews; the coach detail route shows workout targets and Why this?; users save a proposed/original choice and then start the exact plan in the existing logger. Acceptance survives reloads through `coach_decisions` (migration `0005_icy_juggernaut`). Starts are idempotent, recheck stale inputs and refuse to overwrite another active session. Existing linked sessions resume unchanged, even after inputs change; completed sessions reopen as history. Manual and coach starts share session creation.

Your plan shows the actual recurring weekday schedule and session history. This is not yet a dated four-week programme or a completion calendar. Time-budget adaptation, RIR prescription, generated programmes, feedback prompts and learned models remain later work.

Concurrency: acceptance/start briefly take database SHARE ROW EXCLUSIVE locks on the input tables, then lock the account, and validate with READ COMMITTED before writing. This coordinates existing CRUD/provider writers without relying on them to opt into a new lock protocol. Locks are database-wide for those tables; transactions perform no network work, have a three-second lock timeout and bounded deadlock retries. Replace with a proven account-scoped writer protocol before scaling concurrent ingestion; do not simply remove these locks. Preview reads keep repeatable-read snapshots.

Validation: 32 backend tests passed, including acceptance, duplicate/concurrent start, stale-input rejection, ownership and the real set-log/finish path. Root and mobile typechecks, mobile lint and iOS/Android bundle exports passed. Physical-device runtime verification remains outstanding. Migrations were tested on isolated databases, not applied to production.

## Outcome and scope

Connect the approved Today / Your plan / Why this? concept to the native app. First deliver a complete journey using saved workouts, check-ins and the current readiness service: review a proposal, see its exact changes, accept it, start/resume the matching session, log results and return to an updated plan.

This document is an implementation backlog, not a claim that these changes have shipped. It refines `AI_TRAINING_PLAN.md`. First release uses versioned rules and deterministic explanations; model training is a later consumer of the decision/outcome records.

## Verified starting point

Inspected current source, including changes newer than the original AI proposal:

| Existing component | What can be reused | Gap to close |
| --- | --- | --- |
| `server/readiness.ts`, `GET /api/readiness` | Modes, source availability, provider scores, reasons and rule version. | It computes transient guidance; it does not persist a workout proposal or personal HRV/sleep baselines. |
| `server/routes.ts`, `GET/POST /api/check-in` | Today's energy, soreness and limiting illness/pain/injury, keyed by account timezone. | Add nullable available minutes and a revision usable for invalidation. Missing check-in must remain distinct from a normal check-in. |
| `server/training.ts` | Template ownership, ordered exercises, active session reuse, logged sets and immutable session plan snapshots. | Current lighter action recalculates guidance at start and reduces each exercise to 75% of sets, rounded down with a minimum of one. It does not represent the previewed proposal. |
| `server/wearables.ts`, `server/wearable-providers.ts` | Provider authorisation, sync and disconnect code. | Live provider verification remains a separate gate. Review source freshness and revocation semantics before using readings in new proposals. |
| `mobile/src/app/(tabs)/index.tsx` | Today screen, check-in form, readiness fetch and nutrition summary. | Replace guidance-only card with the connected coach; retain nutrition below it. |
| `mobile/src/app/(tabs)/train.tsx` | Saved workouts, start/resume and recent sessions. | Add a dated week view and link today's entry to the same recommendation. |
| `mobile/src/app/workouts/session/[id].tsx` | Existing session destination. | Show accepted targets and connect completion to recommendation outcomes. |
| `mobile/src/lib/use-resource.ts` | Focus and app-resume reloads. | Add request ordering/account guards and explicit refresh after mutations; older requests must not overwrite newer account/data state. |

The prototype's 21-day baseline, RIR targets, sample sleep/HRV trends and 35-minute session are illustrative. Current readiness uses provider bands and seven prior scored days for its progression suggestion. Do not display prototype figures or silently substitute its rules for existing behaviour.

## Screen-to-data mapping

| Concept | Connected behaviour |
| --- | --- |
| Today heading | Authenticated account timezone and current local date. |
| Check-in | Real energy/soreness/limitation controls plus available minutes; save before refreshing a proposal. Remove the mock scenario switch. |
| Sleep / HRV | Display usable provider values and observation/source timestamps. Show “Unavailable” or “Not enough history” when appropriate. Personal trend labels wait for the baseline milestone. |
| Coach recommendation | Server-authored proposal linked to a scheduled workout and input snapshot. Missing check-in prompts completion; no scheduled workout prompts selection. |
| Workout list | Exact ordered exercises and set/rep/rest targets from the proposal, with explicit original-versus-proposed changes. |
| Why this? | Reasons, source freshness and changes from that proposal ID, never from a second independently calculated readiness response. |
| Your plan | Account-local calendar dates, scheduled instances and linked session status. Start with the user's real schedule; do not invent a four-week block. |
| Use this workout | Persist acceptance; then show Start workout. Starting creates/resumes the accepted snapshot. “Accepted” alone must not record exercise completion or start elapsed time. |
| Session completion | Update session and schedule state, then request optional effort/feedback. Missing feedback is unknown. |

Keep Today and Train within the existing app-wide navigation. Put Why this? in a focused detail route. Share components/data across these entry points rather than duplicating a second app navigation system.

## Persistence and contracts

Use additive migrations. Allocate the migration number at implementation time because other work is active. Keep old records valid; backfill new fields as unknown, not inferred health facts.

Proposed records:

- `scheduled_workouts`: owner, local date, template reference, template version/content hash, status and eventual session reference. Materialise explicit dated instances from weekly schedules; preserve user edits and completed dates on regeneration. Several workouts on one day require a chooser, not an arbitrary “first”.
- `coach_recommendations`: owner, scheduled instance, local day/timezone, creation/expiry, input revision/hash, policy version, source references/quality, immutable original and proposed exercise snapshots, structured reason codes and changes, state. Separate evidence availability from any future calibrated model confidence.
- `coach_decisions`: recommendation, request key, accept/original/decline choice, optional reason and timestamp. Retain the chosen immutable plan and its link to the eventual session. Reusing a request key with a different payload returns a conflict.
- `session_feedback`: owner, session/recommendation references, optional perceived effort and “too easy / about right / too hard”, optional override reason and timestamps. Distinguish explicit completion, partial work and abandoned sessions; silence is not an abandonment label.
- `training_profiles` in a subsequent milestone: goals, experience, equipment, availability and explicit exclusions. Needed for generated multiweek programmes, not for displaying an existing user-created schedule.

Add shared Zod request/response schemas in `shared/coach.ts`; mirror no hand-maintained alternative definitions in mobile. Add `recommendationId` and decision provenance to session snapshots without breaking historical snapshot readers.

Proposed endpoints, all account-scoped with health responses marked no-store:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/coach/today` | Read today's context, schedule, latest proposal/acceptance and active session. Does not create recommendations on GET. |
| `POST /api/coach/recommendations` | Build/reuse a proposal for an owned scheduled instance, using current saved inputs and an idempotency key. |
| `GET /api/coach/recommendations/:id` | Return the exact proposal and explanation, including whether it is now stale. |
| `POST /api/coach/recommendations/:id/decision` | Accept a proposed/original valid plan or decline; persist the reviewed choice. |
| `POST /api/coach/decisions/:id/start` | Transactionally start/resume the chosen plan, returning the existing session shape. |
| `GET /api/coach/week?start=YYYY-MM-DD` | Seven dated entries, explicit rest/unscheduled states and linked session outcomes. |
| `PUT /api/training/sessions/:id/feedback` | Upsert feedback for an owned session without altering recorded sets. |

Continue existing template and session APIs. Refactor common session creation into a service used by both legacy and coach routes; do not duplicate exercise snapshot logic. Validate the full proposal server-side, never trust exercise targets supplied by the client.

## Proposal lifecycle and race handling

1. Read a consistent context (schedule/template, saved check-in, relevant history and usable provider records). Generate a bounded proposal and store its versioned inputs and exact plan.
2. Change of check-in, schedule/template, relevant completed session, provider revision/availability, or local day invalidates a pending proposal. Return an explicit stale state; never replace what the user is viewing silently.
3. Acceptance verifies ownership and input revision under the same serialisation strategy used by input writers. A revision/hash check without concurrency coordination is insufficient. On conflict return `409` and a review action, with no session created.
4. Acceptance freezes a choice; start revalidates eligibility if inputs changed since acceptance. A new limiting symptom requires review. A current active session takes precedence: resume its existing snapshot without adaptation.
5. Start locks the account/decision and creates exactly one linked session. Repeat requests return that session. If a different active session exists, offer resume or explicit resolution rather than silently creating another.
6. Finishing a session updates its schedule link. Capture outcomes against the recommendation actually used, including a choice to keep the original plan. Do not mutate the underlying template or completed history.

For input writers that cannot participate in the same database lock, maintain transactional revision counters and use conditional writes. Provider sync can produce a newer proposal but never rewrite an accepted or active snapshot.

## Delivery backlog

### 1. Shared contract and persistent proposals

Create `shared/coach.ts`, `server/coach/context.ts`, `server/coach/planner.ts`, `server/coach/routes.ts` and additive schema changes. Reuse `assessReadiness` through an explicit policy adapter. First version may offer the existing bounded lighter-set option; only claim adjustments the planner actually makes. Preserve explicit limiting-symptom handling. Do not auto-increase load from high provider scores.

Done when a real owned template and check-in produce a persisted, replayable proposal whose reasons and sets agree. No exercise substitution or duration promise without supporting metadata/calculation. Return estimated duration or unknown; include warm-up, work, rest and transitions in any estimate. If a time constraint cannot be met, return an explicit infeasible/shorter-session choice rather than silently dropping essential movements.

### 2. Connect Today, Why this? and session start

Add shared coach components and `mobile/src/lib/coach.ts`. Replace the Today guidance card with proposal states and implement the explanation route. Reuse the existing session logger. Refresh after saved check-in, acceptance and completion; handle app resume/day rollover. Unsaved form edits never change the server-backed explanation.

Done when accept → start → log → finish works using real account data, including repeated taps, timeout/retry and app restart. Display a stored stale result read-only on network errors; do not permit offline acceptance/start in this milestone. Clear account-bound data on logout/switch.

### 3. Connect the week and feedback

Materialise dated workouts from existing scheduled weekdays, with explicit selection/editing for ambiguous or empty schedules. Link completion by scheduled instance, not template name or weekday. Add optional post-session feedback and a weekly summary based only on recorded work.

Done when Today and Your plan show the same instance/session status and next week's schedule does not reuse last week's completion state. Missed workouts remain missed/unscheduled until a user explicitly reschedules them.

### 4. Add generated programmes and richer adaptation

Build profile onboarding, reviewed programme templates and explicit four-week blocks. Enrich exercises with movement/equipment/substitution metadata. Add validated personal sleep/HRV baselines with device-specific metric definitions and minimum usable history. Distinguish prescribed RIR from logged RPE; adding RIR needs a separate field and UI copy, not relabelling RPE. Progress from completed reps/effort under a versioned policy.

Done when a new user can obtain a feasible programme and insufficient history produces honest fallback guidance. Validate programming policies with a qualified training professional before broader release.

### 5. Verify wearables, then prepare learning

Run real-account WHOOP/Oura connection, refresh, stale/revoked/deleted-record and resync checks. Native HealthKit/Health Connect and catalogue imports remain follow-on integrations from `AI_TRAINING_PLAN.md`; they do not block the saved-workout journey. Capture consent-aware decision/outcome exports only once lifecycle reliability is established. Introduce LightGBM/MLflow when representative data justify evaluation.

## Verification and rollout

- Backend integration tests: ownership isolation, immutable snapshots, duplicate request keys, conflicting inputs, concurrent sync/check-in versus acceptance, repeated starts, changed templates, active sessions and completion attribution.
- Planner fixtures: no check-in, no wearable, stale/calibrating/conflicting sources, low energy, limiting symptoms, minimal sets and infeasible time budgets. Require all enforced constraint cases to pass.
- Date tests: midnight rollover in the account timezone, daylight-saving transitions, timezone change, repeated weekly templates and multiple sessions on one date. Preserve historical scheduled dates/timezones.
- Mobile checks: root `npm run check`, `npm test`, `npm run build`; mobile `npm run check` and `npm run lint`; real-device exercise of loading/error/empty states, double taps, app restart and large text. Read version-matched Expo 57 docs before changing native APIs, as required by `mobile/AGENTS.md`.
- Introduce an account-scoped coach feature flag. Keep existing manual template/session routes available, monitor redacted error/conflict counts and roll back the feature without deleting training history. No health payloads in operational logs.

Suggested first pull request: shared contracts + proposal persistence + preview/Why this? API and integration tests. Second: native screens + acceptance/start. Third: dated week + feedback. These establish the real-data loop before adding new model or wearable dependencies.

## Dated plan milestone — 30 September 2026

The native dated plan, Today scheduled-workout selection, revision-checked rescheduling/skipping, exact scheduled-session linkage, and optional completed-session feedback are implemented. Four-week expansion uses the user's saved weekday templates; it does not invent a programme. Native template edits use optimistic version checks and do not rewrite historical session snapshots. Migration 0008 adds the dated records and feedback. Backend tests cover ownership, duplicate builds, stale revisions, scheduled start, completion isolation and feedback restrictions. Signed device validation remains outstanding; see PRIVATE_BETA.md.
