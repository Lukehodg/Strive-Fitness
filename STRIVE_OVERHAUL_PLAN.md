# Strive Fitness — review and overhaul plan

Prepared 29 September 2026. Priorities confirmed: native iOS and Android using React Native/Expo; WHOOP and Oura first; email importing and sending.

Implementation status is tracked in [OVERHAUL_PROGRESS.md](OVERHAUL_PROGRESS.md). The initial foundation, native training/routine logging, wearable connection/sync code and first explained readiness rules are now implemented. Live wearable/device validation and the remaining milestones below are still outstanding; the review findings describe the original repository state.

## Recommendation

Build Strive around one daily decision: **What should I do today, given my plan, recovery and real-life constraints?** Support that decision with dependable workout logging, food macros and supplement/medication schedules.

Keep the useful TypeScript/React foundation. Replace prototype authentication, in-memory persistence, simulated integrations and random workout selection. Deliver a native React Native/Expo app for iOS and Android as the primary product. Keep the web client as a development companion. Use native navigation, secure token storage and system-browser connection flows; plan offline logging, local notifications and future HealthKit/Health Connect access as dedicated milestones.

Assumption: begin with a small private beta while keeping accounts isolated. Personal-only versus commercial distribution remains undecided; it affects provider approvals, operating costs and launch work.

## Review scope and evidence

Reviewed source on GitHub's `main`, whose repository page showed head `ac5d6da7627163255e287eb710f0ee77aacc769e`. Files inspected: root package.json; server authentication, entry point, routes, wearable integrations and workout generator; relevant storage excerpts; shared schema; frontend App.tsx; mobile directory and README. This is a focused source review, not a complete security audit or a tested deployment review. No live app or automated tests were run. The supplied local workspace was empty apart from Git metadata; source-download approval timed out, so inspection used the signed-in browser. Other branches were not reviewed.

### Findings that drive the plan

| Priority | Verified finding | Consequence and required change |
| --- | --- | --- |
| P0 | `handleSignIn` looks up a user but never verifies the password; signup passes the password through unchanged. Social sign-in is mocked. | Replace demo authentication before connecting real accounts or storing health data. Require verified identity and server-side sessions. [Source](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/auth.ts) |
| P0 | API handlers accept user/resource IDs from requests; the reviewed entry point and routes do not enforce authenticated ownership. | Users could access or modify another user's records in this code path. Derive identity from authentication and check ownership for every resource, including child records. [Routes](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/routes.ts), [entry point](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/index.ts) |
| P0 | The exported storage instance is `new MemStorage()`, despite a Drizzle/Postgres schema being present. | Runtime data is not durable across process restarts. Implement database repositories and migrations; verify restart and restore behaviour. [Source](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/storage.ts) |
| P1 | WHOOP/Oura connection functions return simulated success; sync produces fixed sample records; connection status is mocked. | Existing integration screens cannot be treated as working connections. Replace the entire connection lifecycle. Keep demo fixtures explicitly separate. [Source](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/healthIntegrations.ts) |
| P1 | Workout generation shuffles a fixed exercise catalogue and uses focus/difficulty/equipment. It does not read recovery or training history; requested duration is not passed into exercise selection. | Replace with a structured planning engine that respects programme, time, equipment and recovery constraints. [Source](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/aiWorkoutGenerator.ts) |
| P1 | Meal create/edit/delete updates today's statistics rather than consistently using the meal's date. Updates use read-modify-write totals. | Historical logging can corrupt today's totals; concurrent updates can lose changes. Aggregate by the user's local meal date or maintain totals transactionally. [Source](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/routes.ts) |
| P1 | Health metrics lack first-class provider IDs, units and provenance; integration imports put source information into notes. Medication dose/frequency are free text; schedule status uses independent booleans. | Add typed observations and deduplication; structured doses, schedules and a single coherent administration status. [Schema](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/shared/schema.ts) |
| P1 | Response bodies are included in server logging, and several routes log submitted workout data. | Replace with redacted operational logging before collecting sensitive data. [Entry point](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/server/index.ts) |
| P2 | The application shell constrains the main page to `max-w-lg`, has static notification content and uses full-page navigation for some actions. | Design proper desktop and mobile layouts, real notification state and consistent routing. This is a code-based UX finding, not a visual audit of a running app. [Source](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/client/src/App.tsx) |
| P2 | Root scripts include build/typecheck but no test command; no root README is present. | Establish reproducible setup, CI and targeted tests. Test coverage elsewhere remains unverified. [Package](https://github.com/Lukehodg/Strive-Fitness/blob/ac5d6da7627163255e287eb710f0ee77aacc769e/package.json) |

The existing exercise/workout/meal/medication concepts and UI primitives are useful starting points. Billing is also prototype code: the subscription route marks a transaction completed without a payment-provider confirmation. Keep monetisation outside the first beta; rebuild billing around verified payment events if commercial launch is chosen.

## Product and interface

Use five main destinations: **Today, Train, Food, Health, Connections**. Put profile, privacy and notification preferences in settings. Within Health, separate Recovery from Supplements & Medication.

**Today:** a clear training recommendation, why it changed, source freshness, today's session, remaining macros and due items. A compact check-in asks about energy, soreness, illness/injury and available time. The primary action is reviewing or starting today's workout. Avoid a wall of competing scores.

**Train:** weekly programme, custom workout builder, exercise substitutions, sets/reps/load/rest and effort targets; support duration/distance for cardio. Preserve completed history when templates change. Save sessions during interrupted connectivity and safely reconcile retries.

**Food:** search, barcode entry/scanning, custom foods, weighed portions, recipes, favourites and copy-last-meal. Show calories, protein, carbohydrate, fat and optionally fibre. Distinguish logged intake from targets and estimates.

**Health:** recovery trends plus user-entered supplement/medication plans, scheduled/taken/skipped events, history and notes. Keep medication details out of general notifications by default.

**Connections:** WHOOP, Oura and email accounts in one place. Each shows permitted data, connected account, last successful sync, latest available observation and an actionable error state. Distinguish authorising, initial import, connected, delayed and reconnect required. Disconnecting and deleting historical data are separate choices.

Design direction: restrained neutral surfaces, one accent colour, clear typography, consistent spacing, readable charts and generous touch targets. Use a sidebar and wider content on desktop, bottom navigation on phones, light/dark modes, keyboard support, labelled controls and colour-independent status text. Build empty, loading, denied-permission and offline states alongside the happy path.

Onboarding: goals → training experience/equipment/time → optional WHOOP/Oura connection → import progress → optional email setup → first useful daily plan. Users must be able to log manually while connections are pending.

## WHOOP and Oura

Implement direct provider adapters behind one internal contract: authorise, exchange/refresh tokens, backfill, incremental sync, process changes, disconnect. OAuth tokens and client secrets stay encrypted on the server; never in the browser bundle or logs.

WHOOP's documented API provides recovery, sleep, cycles/strain and workout data. Use current v2 endpoints and v2 webhooks, handle pagination and updated/deleted records, and fetch authoritative records after webhook events. New apps start with a ten-member sandbox and require approval for higher tiers. [API](https://developer.whoop.com/api/), [webhooks](https://developer.whoop.com/docs/developing/webhooks/), [approval](https://developer.whoop.com/docs/developing/app-approval/).

For Oura, target readiness, sleep, activity and supported physiological observations through API v2. Confirm exact fields, scopes, webhook coverage, limits and history availability in the developer spike before promising individual metrics. The current support page directs new applications to the newer developer portal; Gen3 and later users need an active membership for API data access. [Current support](https://support.ouraring.com/hc/en-us/articles/4415266939155-The-Oura-API), [v2 documentation](https://cloud.ouraring.com/v2/docs), [OAuth](https://cloud.ouraring.com/docs/authentication).

Start with a configurable recent-history import, aiming for 30 days where available. Process webhook notifications through a durable queue; add scheduled reconciliation for missed events. Validate provider signatures where supported, retry with backoff, respect rate limits and serialise token refresh. Record sync failures without inventing replacement readings.

Store provider record ID, metric, value, unit, observation period, local day/timezone, ingestion time, source and quality. Deduplicate on provider/user/record identity. Link overlapping workouts rather than counting both; never sum both devices' calories or steps. Maintain baselines per device and metric definition. Show WHOOP recovery and Oura readiness separately: they are not interchangeable measurements to average blindly. Mark disagreements and lower recommendation confidence.

## Adaptive workouts and daily suggestions

Use a versioned, testable rules engine for the first release. An optional language model can later explain the structured result or parse a request, but should not control dose changes or invent training prescriptions from incomplete data.

Inputs: goal and training programme; recent sessions and effort; available time/equipment; user constraints; sleep/recovery trends; source freshness and completeness; daily check-in. Establish a personal baseline over an initial observation period, provisionally 2–4 weeks, with the exact policy validated during beta.

Outputs: **progress within the programme, maintain, reduce, recover, or insufficient data**. Adjust session volume, effort or exercise selection within explicit programme bounds. Good recovery alone must not add an unplanned maximal session. Missing data must never become a high-readiness signal; illness, pain and user-reported limitations take precedence over a favourable score.

Every recommendation stores the input snapshot, rule version, confidence, reasons and proposed plan changes. Show a reviewable before/after comparison and let the user accept or keep the original plan. Do not rewrite an active session when a late webhook arrives.

Example product copy, not a clinical rule: “Your recent sleep is below your usual range and you reported high soreness. Today's session keeps the main movements and reduces accessory work.” A stale-data example: “Oura has not supplied a new night of sleep. Complete your check-in to review today's plan.”

Validate rule boundaries with a qualified training professional before presenting adaptive recommendations broadly. Track acceptance, overrides, completion and reported effort to identify poor recommendations; do not claim medically validated readiness.

## Food and macro tracking

Retain the barcode/search concepts, review the existing Nutritionix and Open Food Facts adapters, and select providers after checking target-market coverage and licensing. Open Food Facts requires attention to attribution/licensing, identification and rate limits; cache appropriately and offer manual correction. [Official documentation](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/).

Model foods, nutrient snapshots, serving conversions, recipe ingredients and consumed portions separately. A food database correction should not silently rewrite previous meals. Keep unknown nutrient values distinct from zero. Confirm raw versus cooked weight and per-serving versus per-100g values. Use appropriate decimal precision and round for display.

Calculate daily totals by the meal's local date, including edits across midnight or date changes. Start with user-confirmed macro targets. Do not automatically eat back all wearable-estimated energy expenditure. Photo-based estimates can be a later convenience, always reviewable before saving.

## Email importing and sending

Treat these as two separate capabilities.

**Sending:** send opt-in daily plans and weekly summaries from a Strive-owned transactional email service. This does not require permission to send as the user. Include timezone, send window, quiet days, unsubscribe/preferences, delivery retries and duplicate prevention. Default to a brief notification with an authenticated link; let users explicitly choose whether health details appear in email.

**Importing:** begin with a private per-user forwarding address and a review inbox. Support a small set of concrete document/message types first: workout plans, nutrition summaries and supplement purchase information. Purchases are inventory suggestions, not proof that a supplement or meal was taken. Extracted records stay drafts until confirmed; show source and confidence. Duplicate messages must not duplicate records. Bound attachment size/type and sanitise content. Email content is untrusted data, never instructions to the assistant or backend.

Then add Gmail and Outlook OAuth connections for users who want automatic imports. Let users choose senders, labels/folders and a date range, while explaining accurately that an app-side filter does not narrow an OAuth token's underlying mailbox permissions. Avoid storing unrelated messages. Direct inbox reading is a separate milestone, not silently replaced by forwarding.

Gmail read scopes are restricted; public/server-side use can require OAuth verification and a security assessment, subject to applicable exceptions. Verify the proposed use case against Workspace policy before committing launch dates. [Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [permitted use](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

Outlook should use delegated Microsoft Graph permissions and a separate adapter. Confirm account/tenant consent requirements and sync strategy in the spike. Sending as the user is optional future scope, not needed for Strive summaries. [Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference).

## Supplements, peptides and medication

One tracking system with explicit categories: supplement, medication or peptide. Keep category separate from form/route (tablet, liquid, injection, etc.). Record name, user-entered dose and unit, schedule, start/end dates, instructions, optional clinician details, remaining supply and notes.

Separate the plan from each scheduled occurrence and actual administration. Support daily, selected weekdays, interval-based and as-needed entries; taken, skipped and missed states; amendments with history; pause/resume; timezone-aware reminders; and optional injection-site history. Editing a schedule must not change what was historically recorded as taken. Preserve distinctions such as mg, mcg and mL; do not infer conversions without a specified concentration.

This feature records an existing regimen. Do not generate peptide cycles, recommend medication doses, compensate automatically for missed doses, or alter schedules from wearable scores. User-entered clinician instructions can be displayed exactly. Interaction checking would require a separately validated, maintained clinical source and is outside the first release.

## Technical architecture

Retain React, TypeScript, Vite, existing accessible UI primitives, React Query, Express and Drizzle/Postgres as the default direction, subject to a clean install/build and dependency audit. A framework rewrite has no demonstrated benefit at this stage.

Use a modular backend with one database and a separate background worker: identity, integrations, observations, training, nutrition, regimens, email and recommendations. Avoid introducing microservices prematurely. Share validated domain contracts across web, worker and the native mobile app.

Core new entities: connected accounts and encrypted credentials; consent events; sync jobs/cursors and provider records; observations and daily summaries; programmes and versioned sessions; food/recipe/meal items; regimen plans, occurrences and administration events; email import drafts; notification preferences and delivery events; recommendation snapshots and user decisions.

Add foreign keys, ownership constraints, useful indexes, idempotency keys and strict input schemas. Replace unrestricted patch payloads with allowlisted updates. Implement durable migrations, backups and a tested restore procedure. Replace prototype response/body logs with redacted structured events and operational metrics. Include export, retention and deletion workflows; disconnect stops future processing immediately, including queued work. Make jurisdiction-specific privacy review a launch task once audience and hosting region are decided.

## Delivery plan

These are provisional effort ranges for one experienced full-stack engineer with part-time design/QA support. They are not a fixed quote; provider approvals and an unverified build can extend elapsed time.

| Phase | Effort | Concrete outcome and exit gate |
| --- | --- | --- |
| 0. Establish baseline | 3–5 days | Obtain working checkout; inspect remaining files/branches; run build/typecheck; inventory real data; confirm audience and email examples; prove developer access to WHOOP/Oura. Agree acceptance criteria and design direction. |
| 1. Trustworthy foundation | 1–2 weeks | Real authentication/ownership, durable Postgres, migrations, redacted logs, CI and new responsive shell. Two-account access tests pass and records survive restart. |
| 2. Wearables and Today | 2–3 weeks | WHOOP/Oura connection, import, change processing, deduplication, freshness and baseline views. Replaying a webhook does not duplicate records; revocation and delayed sync are handled clearly. |
| 3. Training and adaptation | 2–3 weeks | Workout builder/logger, weekly programme and reviewable daily adjustments. Deterministic tests cover missing/conflicting signals, manual restrictions and programme limits. |
| 4. Nutrition and regimens | 2–3 weeks | Accurate portions/recipes/date totals; schedules and administration history. Historical meal edits and DST/schedule changes preserve correct records. |
| 5. Email | 1–2 weeks core; 1–3 more for mailbox connectors | Forwarded imports plus scheduled summaries, then Gmail/Outlook. Draft review, duplicate handling, preference enforcement and reconnect work; approval gates satisfied before public availability. |
| 6. Beta hardening | 1–2 weeks | Real-device/browser QA, accessibility, realistic load tests, restore rehearsal, privacy/export/deletion validation and monitored beta. |

Planning envelope: approximately **11–19 engineering weeks for the core beta**, plus **1–3 engineering weeks for direct mailbox connectors** and variable external review time. Re-estimate after Phase 0. This earlier estimate assumed web-first delivery and is superseded by the confirmed native iOS/Android scope. Re-estimate after the native foundation and device testing; include signing, store review, deep links, notifications and offline behaviour. Payments, clinical features and additional wearables remain outside the core beta.

## First implementation backlog

1. Establish a reproducible checkout, setup guide, environment example and CI build/typecheck baseline.
2. Replace demo login and add server-side identity/ownership to every API operation.
3. Replace MemStorage with Postgres; migrate any genuine existing records with validation and rollback.
4. Add provider connection/token/sync tables and a durable job worker.
5. Build WHOOP integration end to end; prove connect → import → display → disconnect on a real consenting account.
6. Add Oura using the same contract; implement source precedence and duplicate-workout handling.
7. Deliver Today, Connections and the daily check-in with honest empty/stale states.
8. Add versioned programme/session models and deterministic readiness adjustments.
9. Fix macro aggregation before expanding food entry; implement structured regimens and history.
10. Add email delivery/import drafts, then direct mailbox connectors behind feature flags.

The first meaningful milestone is a secure account showing real WHOOP/Oura data and one understandable daily recommendation. That proves the central value before expanding secondary features.

## Measures and open decisions

Measure connection completion, time to first real reading, sync success/lag, duplicate rate, food-log completion time, recommendation overrides, session completion and reminder delivery. Suggested usability goals to validate in beta: a returning user can log a usual meal in under 30 seconds and understand why today's workout changed without opening a chart.

Before estimating delivery precisely, resolve: personal/private beta or commercial product; primary phone platform; Gmail, Outlook or both at launch; representative email types to import; existing production users/data; hosting and operating budget; training goals and available equipment. These do not prevent starting the foundation review and design.

