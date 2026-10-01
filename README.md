# Strive Fitness

The overhaul targets native **iOS and Android with React Native/Expo**. Start with [the mobile app](mobile/README.md). This repository also contains the shared backend and a browser development companion. The first milestone replaces the demo backend with account-scoped persistence and introduces native sign-in, Today, check-ins and manual food logging.

## Local development

Requires Node.js 22.13 or newer for both projects.

```sh
npm ci
npm run dev
```

Open http://localhost:5000 and create an account. No external credentials are needed for local manual tracking. Development automatically applies migrations to a local PGlite database in `.data/strive` and seeds only the exercise catalogue. Personal records are never seeded. Keep this folder to preserve local accounts and records. Run one server per local database directory.

Copy `.env.example` to `.env` to override configuration. Never commit credentials or local health records.

## Verification

```sh
npm run check
npm test
npm run build
```

Integration tests use isolated local databases, covering authentication, ownership, session revocation, check-ins, local-day meal totals, migrations, persistence, wearable OAuth/refresh/sync and readiness rules. Wearable tests simulate provider responses; live accounts and native device behaviour still require verification. See [wearable setup and acceptance checks](WEARABLE_SETUP.md).

## Database and deployment

Production requires PostgreSQL via `DATABASE_URL`, HTTPS, a persistent database with backups, and explicit migration execution before starting the service:

```sh
npm run db:migrate
npm run build
npm start
```

Run commands from the repository root. Deploy the `migrations` directory with the application. The initial migration targets a **new empty database**; do not apply it to an existing deployment without first mapping and backing up its schema and data. An import path from previous installations is not implemented.

Production session cookies require HTTPS. Set `HOST=0.0.0.0` only when needed by your host. Set `TRUST_PROXY=1` only behind exactly one trusted reverse proxy with direct public access to the application blocked. The current sign-in rate limiter is per process; distributed rate limiting, verified email, password recovery, monitoring, and deployment hardening remain before public launch.

## Current scope

Private iPhone/Android beta deployment and signing instructions are in [PRIVATE_BETA.md](PRIVATE_BETA.md). The repository includes a production Dockerfile, database readiness probe, optional signup invitation list and mobile build configuration checks. Hosting, signing and installed-device validation are still outstanding.

Dated workout plans now materialise saved weekday templates into four weeks, support rescheduling/skipping, and link each day's completion to its own session. Today opens the matching dated preview. Native workout editing checks concurrent changes; completed sessions retain their snapshots. Optional post-session feedback records difficulty and notes without automatically changing future training.

The coach backend now saves reviewable workout previews from owned strength templates and real check-ins/readiness. `POST /api/coach/recommendations` accepts `{ requestKey: UUID, templateId: number }`; `GET /api/coach/recommendations/:id` returns the saved plan/reasons plus current staleness, and `GET /api/coach/today` returns template choices, active session references and the latest same-day preview. Reusing a request key returns the original preview; use a new key after reviewing changed inputs. The native Today and Train screens open saved previews with a Why this? view. `POST /api/coach/recommendations/:id/decision` saves a proposed/original choice; `POST /api/coach/decisions/:id/start` starts or returns its exact saved session. Acceptance does not start the timer. Changed inputs require review before a new session starts. See [the connection plan](COACH_CONNECTION_PLAN.md).

- Password hashing, server-side sessions, account-specific API access and durable storage.
- Responsive navigation, redesigned registration, Today dashboard, saved daily check-ins.
- Existing manual workout, food, health and routine APIs now use owned database records.
- Daily nutrition totals are derived from meals in the account's timezone.
- Native WHOOP/Oura OAuth, encrypted provider credentials, queued syncs and visible connection health. Unconfigured providers remain unavailable.
- Explainable daily readiness guidance and explicitly chosen lighter workout snapshots; original templates and historical sessions are preserved.
- Native supplement/peptide/medication records and taken/skipped dose history.

The older browser tracking screens are being migrated incrementally. Serving-based food logging, editable macro targets, food history and Gmail/Outlook import-review/sending are implemented. See [email setup](EMAIL_SETUP.md) for provider credentials and live validation requirements. Live native wearable/mail validation, a complete food catalogue, programme-aware progression and recurring routine reminders remain. Medication and peptide records are tracking inputs, not automated dosing recommendations.

See [the overhaul plan](STRIVE_OVERHAUL_PLAN.md) for the broader product direction.
