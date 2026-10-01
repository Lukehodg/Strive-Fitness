# Health overview implementation plan

**Goal:** Implement the approved health-first Today concept with real account data on iOS and Android.

**Architecture:** Add nullable WHOOP resting heart rate to the existing daily import. A separate authenticated overview endpoint supplies a bounded calendar history for each provider. Native overview cards and metric detail consume it; the existing readiness endpoint continues to own training interpretation.

**Tech stack:** Expo SDK 57, React Native, Express, Drizzle/PostgreSQL, Node tests.

**Spec:** User-approved interactive `strive-health-overview.html` concept in this thread, 1 October 2026. Scope is Today; food redesign, native HealthKit and AI coaching remain separate workstreams.

**Execution:** Implement in this session under the user's standing instruction to continue without repeated permission. Preserve prior uncommitted work. No unrelated live provider or account changes.

## Constraints and review focus

- Never manufacture missing readings or interpolate gaps. Distinguish historical readings from fresh data suitable for today's decisions.
- WHOOP recovery and Oura readiness stay separate. WHOOP RMSSD does not become an Apple Health HRV value. Oura resting heart rate remains absent until a documented equivalent is mapped.
- Bound queries and responses to the authenticated account and preceding 28 calendar days, excluding future dates/observations.
- Nullable resting heart rate preserves older rows and provider responses without the field. Re-sync backfills the provider's recent window.
- No additional permissions or scopes are needed for WHOOP resting heart rate; retain existing readiness policy.
- New build must not claim HealthKit support from unused installed packages. Do not include unrelated unfinished native capability setup in this release.

## Task 1: Measurements and history

Files: shared/schema.ts; server/wearable-providers.ts; server/wearables.ts; shared/health-overview.ts; server/readiness.ts; migrations; tests/wearables.test.ts; tests/health-overview.test.ts.

- [x] Add tests for nullable heart rate import, provider separation, exact calendar gaps, future exclusion, stale/revoked connections and no-current-day data.
- [x] Add nullable `restingHeartRate` to daily storage; map WHOOP `score.resting_heart_rate`, with null for absent fields and Oura.
- [x] Generate additive migration using Drizzle. Ensure upsert updates the new measurement.
- [x] Implement pure `buildHealthOverview(today, timezone, readings, connections, now)` returning explicit metric history without credentials. Register `/api/health-overview` behind existing authentication.
- [x] Run wearable/overview tests and root TypeScript checks.

## Task 2: Native Today

Files: mobile/src/components/health-overview.tsx; mobile/src/components/home-summary.tsx; mobile/src/components/coach-today.tsx; mobile/src/app/(tabs)/index.tsx.

- [x] Implement four metric cards per provider, an explicit source selector when both providers exist, meaningful missing/sync states and a seven-day mini chart retaining gaps.
- [x] Add metric detail with reading date, unit, 7-day values and source explanation. Do not label stale values as today's usable measurements.
- [x] Place overview above training; use readiness's actual title/reasons. Move check-in into a dismissible form and refresh both guidance and health after save.
- [x] Make food and routine summaries compact and actionable. Respect existing user targets, timezone and active routine logging.
- [x] Run native typecheck/lint and iOS/Android bundle exports. Code review covers empty, partial, stale and dual-provider states; physical-device layout and large-text checks remain pending.

## Task 3: Release

- [x] Run the backend regression suite/build after all changes. Review diff for data exposure and backward compatibility.
- [x] Commit and deploy tested backend changes with its migration; verify Render readiness.
- [x] Submit the iOS preview using existing signing credentials and return the verified build status/link. A submitted build is not an installed-device test.
- [x] Document phone acceptance: fresh sync backfills RHR, compare WHOOP values, refresh/return from background, open metric history, check-in update and missing-provider state.


