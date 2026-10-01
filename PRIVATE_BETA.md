# Strive private beta

Target: installable iPhone and Android internal builds for invited testers. No hosting service has been provisioned and no signing credentials have been created by this work.

## Backend deployment

The Dockerfile packages the built server/web companion and migrations, runs as a non-root user, and excludes local databases, environment files and signing keys from the build context. Docker is not available on this workstation, so the image still needs a container build/smoke test on the deployment host.

1. Provision a managed PostgreSQL database with backups and a container service with HTTPS. Use one API instance for the private beta because current authentication rate limits are per process. Require encrypted database transport according to the database provider's connection instructions.
2. Build the image: `docker build -t strive-beta .`.
3. Store DATABASE_URL, PUBLIC_API_URL (HTTPS origin), INTEGRATION_ENCRYPTION_KEY and optional provider credentials in the host's secret manager. Configure BETA_ALLOWED_EMAILS as a comma-separated invitation list; it gates new signup only. Keep provider credentials out of the mobile environment. Set TRUST_PROXY=1 only behind exactly one trusted proxy with direct public access to the container blocked.
4. Run `node dist/migrate.js` as a one-off job from the image before starting the service. It applies additive migrations and seeds the exercise catalogue. The initial migration expects a new empty database; do not point this at an unrelated existing schema.
5. Start `node dist/index.js`. Use `/healthz` for liveness and `/readyz` for a database/schema readiness check. Verify HTTPS from both phones and test a backup restore before inviting testers.
6. Update provider callback registrations to this backend's documented callback paths. The previous loopback WHOOP smoke test does not verify beta callback registration.

Do not deploy the Vite development server. The production bundle still contains the legacy browser companion and its size warning. Native clients use the authenticated APIs directly.

## App identities and signing

Prepared app identifiers: `com.lukehodg.strivefitness` for iOS and Android, based on the existing Expo account. These are local configuration only; their availability/registration has not been verified on Apple/Google services.

The existing EAS project is `@lukehodg/strive-fitness`. From `mobile/`:

1. Set the EAS preview environment's EXPO_PUBLIC_API_URL to the deployed HTTPS origin. It is public configuration; do not place API keys or database URLs in EXPO_PUBLIC variables.
2. Run `npx eas-cli@latest device:create` and enrol each test iPhone. Run `npx eas-cli@latest credentials --platform ios` interactively to select the Apple team and create/reuse signing credentials. Apple login and two-factor authentication belong in EAS's own flow, not chat.
3. Run `npx eas-cli@latest build --profile preview --platform ios` for ad hoc internal distribution and `npx eas-cli@latest build --profile preview --platform android` for an installable APK. These are paid/quota-consuming cloud jobs; they are not started by local preflight.
4. Disable unauthenticated access to internal builds in Expo project settings if builds must require tester login. Share build links only with intended testers.
5. Install both builds and execute the checklist below. Do not treat successful JS exports as proof the native app works.

Reference: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/) and [EAS build configuration](https://docs.expo.dev/build/eas-json/).

## Verification gate

Local verification on 30 September 2026: all 46 backend tests passed, followed by a passing 13-test coach suite after the Today schedule update. Root/mobile typechecks, mobile lint and the production web/server build passed. Android and iOS Hermes exports passed from an identical source copy outside OneDrive (`%LOCALAPPDATA%\StriveFitness-build-check\mobile`). The synced checkout's directory entries incorrectly reported regular dependency files as symbolic links, causing Metro resolution failures. Use a checkout outside OneDrive and run `npm ci` at the root and in `mobile/` for reliable local builds; no Metro workaround is required.

The CI container job builds this Dockerfile, migrates disposable PostgreSQL and probes the production service. That new job has not been run here. Docker and physical devices are unavailable on this workstation. Successful bundle exports do not constitute signed binaries or device tests.

Run `node --env-file-if-exists=.env scripts/beta-preflight.mjs` with deployment and public mobile configuration supplied in the process environment. It prints presence/validity only, never secrets. It intentionally fails until required setup exists.

- Invite-only signup, sign-in, restore, logout and expired-session handling on both platforms.
- Create workout, assign weekday, create dated plan, reschedule/skip, check in, preview/Why this?, accept, start, record sets, rest timer, restart/resume, finish, feedback and history. Repeat a start request and verify there is only one linked session.
- Missing/stale wearable data, pain/illness check-in, timezone/date rollover, and a changed check-in after acceptance.
- Food portions/editing/history, routines/taken/skipped history, and provider connect/revoke callbacks.
- Network loss during every write; confirm accurate failure states and retry behaviour. General offline writes are not currently supported.
- Large text, VoiceOver/TalkBack, keyboard avoidance, safe areas, Android back and app lifecycle.

## Scope still beyond this beta gate

Automatic four-week programme design from an onboarding profile, learned-model training, cardio-specific logging, offline write queues, barcode catalogue UI, routine push reminders, public-account recovery/verification and full privacy self-service remain separate features. The dated plan currently schedules the user's existing workouts. Clinical validation and claims of medical readiness are not part of this beta.
