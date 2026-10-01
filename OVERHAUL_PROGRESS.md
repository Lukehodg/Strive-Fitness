# Overhaul progress — 29 September 2026

## Hosted backend — 1 October 2026

- Deployed the overhaul branch to https://strive-beta-api.onrender.com with paid Render API/PostgreSQL services in Frankfurt. Base cost $13.30/month before taxes/extra usage; owner approved up to $20 for the first month including temporary recovery verification.
- HTTPS health/readiness passed; HTTP redirects to HTTPS; protected routes return 401; uninvited signup returns 403. Database external access is blocked and the private database transport uses TLS 1.3.
- All GitHub jobs passed, including Docker/PostgreSQL, backend tests/build and native checks/exports. Fixed mobile CI's missing root dependency installation for shared schemas. Added validated Render startup with a provider-generated encryption key, retained without copying it into chat or Git.
- A real backup export and isolated point-in-time restore passed: the restored 9 migrations, 28 tables and 87 exercise records matched the live checksums. No health records were imported. See RENDER_DEPLOYMENT.md for evidence and cleanup status.
- The owner's beta invitation is stored privately in Render. Native signed builds, actual device callback tests and provider configuration remain separate next steps; hosting alone does not connect WHOOP/Oura/mail.

## Direction

The confirmed product is a native iOS and Android app using React Native/Expo. `mobile/` is the primary client. `client/` is a temporary browser companion; its desktop layout is not the mobile product.

## First milestone delivered

- Expo SDK 57 application with protected navigation, native registration/sign-in, secure session storage and five tabs.
- Native daily check-ins and manual food/macro logging against the shared backend. Existing workout and regimen records can be viewed.
- Persistent database, migrations, password hashing, revocable browser/native sessions and account ownership checks.
- Nutrition totals calculated from actual meals in the user's timezone.
- Fake sync and random workout generation were removed. WHOOP/Oura implementation is recorded below; email remains pending.
- CI for backend verification and native type checks, lint and platform exports.

## Native training and routine milestone

- Transactional workout creation with retry deduplication, exercise search/order, sets/reps/rest and optional weekly scheduling.
- Start/resume strength sessions, save/update weight/reps/RPE, finish and view history. Starting a session snapshots its plan; later template changes do not rewrite that history.
- Saved sets survive app restarts because they are recorded on the backend. Unsubmitted input is not an offline draft; a network connection is required.
- Routine creation/editing with supplement/peptide/medication categories, archive/restore and taken/skipped event history that retains the dose recorded at that time.
- Additive migration `0002_free_scarlet_witch.sql`. Automated tests cover atomic creation, concurrent retries, ownership, completed-session write protection and routine history preservation.

## Removed

The unused `react-native-migration/` Expo 48 prototype, generated native starter screens, mock wearable implementation, unused random workout generator/storage adapter and obsolete Passport/session-store dependencies. The original tracked prototype remains recoverable from Git history.

## Wearables and explained guidance milestone

- WHOOP/Oura system-browser authorization with one-time app claims, account-bound callbacks and Oura PKCE. Provider secrets stay on the server; credentials are encrypted with AES-256-GCM.
- Durable sync scheduling, database leases that serialize refresh/link/disconnect, persisted token rotation, bounded paginated downloads, retry/backoff and reconnect states. Thirty-day reconciliation imports actual readiness/recovery, sleep and HRV; failed partial downloads preserve saved readings.
- Native Connect now handles real connection status, queued/active syncs, last-sync and latest-reading dates, reconnect and disconnect/removal. Providers remain unavailable until configured.
- Daily guidance applies provider-specific bands, freshness and calibration checks, a prior-data gate for progression, and user check-in overrides. Optional lighter sessions preserve the original workout template and snapshot their rationale.
- Added migration `0003_tough_spencer_smythe.sql`, provider/HTTP/database/readiness tests and [live-test setup](WEARABLE_SETUP.md).
- The wearable milestone passed its 22 backend tests, backend TypeScript/build and native TypeScript/lint, both platform bundle exports and Expo Doctor (21/21). Physical-device runtime validation remains outstanding.

## WHOOP live provider check

- On 29 September 2026, real WHOOP authorization, profile verification, recovery/sleep/HRV import and token refresh followed by another successful import passed in the loopback-only smoke test. The test reported 31 scored calendar days in its recent date window.
- `npm run whoop:test` starts the isolated test using the already registered `http://localhost:8765/callback`. Credentials and readings remain in memory; this does not link a Strive database account or verify the native callback.
- Linked the native project to the existing Expo project `@lukehodg/strive-fitness`. The owner confirmed Apple Developer membership. No iPhone build/signing or reachable HTTPS API is configured yet.
- At this point all 30 tests in the working tree, including the newer coach tests, and backend/native type checks plus native lint pass.

## Next milestones

1. Install development builds on iPhone and Android; verify session restoration, keyboard handling, safe areas, accessibility, offline/error states and app lifecycle. Configure a reachable HTTPS API and owner-controlled application IDs/signing.
2. Extend strength logging with cardio measurements, offline drafts and structured recurring regimen reminders. Timed rest controls and template editing are implemented.
3. Validate WHOOP/Oura on real accounts and both mobile platforms; add webhook-triggered ingestion and workout/activity imports after live contract checks.
4. Extend the initial explained guidance with programme history and longitudinal progression. Evaluate rules before presenting stronger training prescriptions.
5. Complete serving-based food tracking and email import review/outbound preferences.

## Known limits

No wearable is linked to a Strive database account and no mailbox is connected. The local WHOOP smoke test has an in-memory connection only. No signed native build has been installed or published; the EAS project is linked but Apple signing remains unconfigured. Native exports are JavaScript/Hermes bundle checks, not device runtime verification. Push notifications, offline writes and session refresh are incomplete. Native template editing is implemented. The legacy browser tracking screens have not received a complete UX migration.

The initial database migration expects an empty database; existing deployments require a separate migration/import plan. Production needs verified email/password recovery, distributed rate limiting, backup/restore verification and monitoring.

Compatible dependency updates and a patched Drizzle ORM reduced inherited findings. The root audit still reports six affected dependencies (five moderate, one high), including the legacy Vite development toolchain; mobile reports thirteen moderate findings. Resolve and re-audit these before a public release. Do not expose the development server publicly.

### Workout journal and records (30 September 2026)

- The local daily preview (`npm run whoop:preview`, http://localhost:8766/) now uses the main server's authenticated training API. Run `npm run dev` alongside it. WHOOP test expiry does not block the workout journal.
- Build a strength workout with exact exercises, set/rep/rest targets and planned duration; save/start, resume an unfinished session, log or update weight/reps/optional RPE, use a rest countdown, and finish into account-owned history.
- Native Train and session screens include a record book, previous completed sets, rest timer and completion achievements.
- Records are derived from saved sets in completed sessions, per account and exercise. Heaviest load, best single-set volume (kg × reps), and bodyweight reps are distinct. First sessions establish baselines; tied values do not receive a new PR. Earlier session achievements exclude later workouts.
- Logging currently covers strength sets in kg. Use a consistent load convention and equipment. Completed sessions are read-only; offline sync, cardio interval logging and retrospective corrections are not implemented.
- Verification: 36 automated tests pass, including account isolation, unfinished-session exclusion, corrections, ties, idempotent completion and stable historical achievements. Root/mobile typechecks and mobile lint passed. Native changes have not yet been exercised on an installed iPhone/Android build.
- Browser verification used an isolated PGlite database: sign-in, create/start, save sets while preserving another draft, reload/resume, finish with skipped sets, and record-book values all verified. No test lifts were added to the user's account. Production build passed (existing web chunk-size warning remains).

## Food, routines, daily overview and email milestone — 30 September 2026

- Native Food now accepts label values per serving, 100 g or 100 ml and scales them to the portion eaten. Users can edit existing entries, repeat them today, set optional macro/calorie targets and browse date-based history. The shared calculation runs server-side; creation keys prevent duplicate saves after retries.
- The local preview now has Today, Workout, Food, Health, Connect and Your data sections. Today combines actual account nutrition, active sessions, routines and saved check-ins. The earlier WHOOP smoke-test example is clearly separate. Health supports routine creation/editing/archive/restore and confirmed taken/skipped history. Account settings include name and timezone.
- In-page dialogs replace blocking browser confirmation popups in the preview. The native app retains its platform alerts.
- Gmail AND Outlook/Microsoft 365 now have native OAuth/PKCE flows, server-encrypted credentials, serialized token refresh, selected inbox import, plain-text review notes, explicit compose/send and sending history. Unknown delivery outcomes are not automatically resent. Setup and limitations are in EMAIL_SETUP.md. No real mailbox has been linked and no real email sent.
- Additive migrations 0006 and 0007 add nutrition retry identity and mail records; existing records are preserved.
- Verification: 43 automated tests passed; the mail suite passed again after callback tightening. Root typecheck/build and native typecheck/lint passed. iOS and Android bundle exports passed after adding Metro visibility for dependency-free shared nutrition code. Browser tests in a separate database verified 175 g scaling, editing to 200 g, routine creation and skipped-dose history, plus the disconnected email state. Phone-width preview has no horizontal page overflow.
- Still outstanding: signed device builds and real-account native callbacks, live Gmail/Outlook validation, food catalogue/barcode workflow, offline writes, routine notifications, richer progression and production account/privacy operations. The legacy web bundle still has the existing size warning.

## Private beta, dated plans and feedback — 30 September 2026

- The owner selected private iPhone/Android beta and requested deployment/signing preparation. Added Docker packaging, isolated production static serving, liveness/readiness probes, optional signup invitation allowlist, EAS HTTPS configuration checks and provisional app identifiers. PRIVATE_BETA.md records deployment, signing and installed-device steps. No service, signing credential or cloud build was created.
- Added dated plans generated from saved weekday templates, rescheduling/skipping with revision checks, Today integration, per-instance session completion and optional post-session feedback. Migration 0008 is additive. Feedback is stored; it does not yet drive automatic progression.
- Native workout editing preserves session snapshots and rejects stale edits. Coach input hashes include dated schedule revisions; changing a date or skipping invalidates an earlier proposal.
- Verification: all 46 backend tests passed; the 13-test coach suite passed again after Today integration. Root/mobile typechecks, mobile lint and production build passed. Android/iOS exports passed outside OneDrive after tracing the synced directory's inconsistent symbolic-link metadata. See PRIVATE_BETA.md for the workaround and precise remaining gates.
- Added CI container build/migration/readiness checks against disposable PostgreSQL; this new job is not yet executed. Local Docker and installed-phone testing remain unavailable. The app is not yet a released or fully complete product; richer programme generation, model training and the remaining scope in PRIVATE_BETA.md still apply.
