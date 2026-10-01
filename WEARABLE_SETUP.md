# WHOOP and Oura live-test setup

The OAuth, ingestion and native connection code is implemented and tested using simulated provider responses. On 29 September 2026 the standalone local WHOOP test also passed real account authorization, profile verification, recovery/sleep/HRV ingestion (31 scored calendar days in the requested recent window), refresh-token rotation and a subsequent import. No real readings or provider tokens were written to the Strive database by this test. Native callback/account linking, Oura and both physical-device flows still require live verification.

## Local provider smoke test

For the registered development callback `http://localhost:8765/callback`, run `npm run whoop:test` with the WHOOP client ID and secret in the ignored root `.env`. Open the launch link printed by the command **on the same computer** and complete WHOOP consent. This standalone listener binds only to loopback, uses a protected local browser session and one-time OAuth state, and calls the same provider adapter as the application. Production HTTPS configuration is unchanged.

The test displays recent real readings and offers import, token-refresh and disconnect checks. Tokens and readings are held only in memory, not linked to a Strive account or written to its database. It stops after one hour; disconnect first if you want the provider grant revoked. This validates the provider contract separately from the native app. The iPhone still needs its signed build and a reachable HTTPS API for end-to-end acceptance.

## Server configuration

Use a dedicated HTTPS test API with a persistent database. Do not expose the Vite development server publicly. Production-mode startup requires PostgreSQL, the migrations and a built application (see README). The server runs the durable wearable sync queue every ten seconds and reconciles connected accounts every six hours. It needs to remain running; this is not phone background execution.

Set these in the backend's environment/secret store, never in the mobile environment or source control:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_API_URL` | HTTPS API origin, e.g. `https://api.example.com`, no path/query |
| `INTEGRATION_ENCRYPTION_KEY` | 64 hex characters representing 32 cryptographically random bytes |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | Credentials from your WHOOP developer application |
| `OURA_CLIENT_ID` / `OURA_CLIENT_SECRET` | Credentials from your Oura developer application |

Generate the encryption key using a cryptographic secret generator and put it directly into your secret store. Preserve it across restarts and store a recovery copy separately from database backups. Changing or losing it makes stored credentials unreadable; automatic key rotation is not implemented.

Configure each provider independently. An unconfigured provider remains visibly unavailable. Apply migration `0003_tough_spencer_smythe.sql` using `npm run db:migrate` before deploying the code; the migrator applies all pending migrations in order.

Register the exact callback for the corresponding provider:

- WHOOP: `https://YOUR_API_HOST/api/integrations/whoop/callback`
- Oura: `https://YOUR_API_HOST/api/integrations/oura/callback`

WHOOP scopes: `offline read:profile read:recovery read:sleep`. Oura scopes: `personal daily`. The profile endpoint is used only to retain the provider's account identifier. Email, body measurements and full provider payloads are not stored by this integration. WHOOP workout/activity imports are a later extension.

Check your provider application's permitted test users and approval status before inviting testers. Passwords and provider tokens are entered or handled only by the provider/server, not shared in chat. Configure any reverse proxy/monitoring to exclude OAuth query strings and authorization headers from logs; the application does not log these values.

## Native build

1. Set `mobile/.env` → `EXPO_PUBLIC_API_URL` to the same test API origin. This is a public address, not a secret.
2. Choose owner-controlled iOS/Android application identifiers and configure your Expo/EAS project/signing. Existing `mobile/eas.json` has development build profiles but no account or signing configuration.
3. Install an SDK 57 development build on iPhone/Android. Rebuild after adding `expo-web-browser`. The `strivefitness` scheme in `app.json` handles the app return; Expo Go is not the acceptance environment for this flow.
4. Sign into Strive, open Connect, select WHOOP and complete WHOOP's sign-in and consent screen. Strive should return to Connect and queue the first sync.
5. Pull down after the sync finishes. Compare today's score and sleep with the provider account, allowing for pending processing. Open Today to inspect the data and explanation. Follow the same sequence with Oura.

## Acceptance checks with the owner's account

- Consent success returns to the correct app/account on both platforms; cancellation/denial leaves no new connection.
- The first import completes, displays a real sync timestamp and latest reading day, and handles an account with no scored readings.
- WHOOP sleep-end dates follow the Strive account timezone; Oura retains its provider-assigned day. Verify a timezone-boundary example if available.
- Expired access tokens refresh without duplicate requests, including after restarting the server. A provider-side revocation eventually prompts reconnect rather than fabricating data.
- Disconnect removes imported readings and stops the queue. If provider revocation fails, the UI tells the user to remove access in their provider settings.
- A cancelled browser, app termination during sign-in, denied scopes, lost network and a late callback have understandable outcomes. A terminated flow must be started again; the claim secret is deliberately not persisted in the app.
- Verify which WHOOP account types/scopes are available to the registered client. The adapter uses a strong random OAuth state and the documented v2 endpoints; exact acceptance is still subject to the live test.

## Implemented sync and guidance rules

Tokens use authenticated AES-256-GCM encryption bound to the Strive user and provider. OAuth state and app claim secrets are hashed in storage, authorization codes are encrypted, and expired attempts are removed by the worker. Callbacks stage the authorization code; only an authenticated, matching app claim can redeem it. Oura additionally uses S256 PKCE.

Database leases serialize linking, disconnecting and refresh/sync work across server processes. Rotated tokens are saved before data downloads. A crash during the external token exchange can still require reconnecting: the provider and local database cannot share an atomic transaction.

Each complete sync reconciles a recent 30-day window with date-boundary padding. Pagination is bounded and validated; incomplete or malformed downloads retain the previous readings and cannot produce a fresh successful sync timestamp. Transient failures back off, rate-limit delays are honoured (bounded at 24 hours), and rejected credentials stop retries until reconnect. No webhooks are implemented yet. Older readings remain until disconnect; data retention/export/account deletion need a complete release policy.

Guidance v1 uses provider-specific score bands, not an averaged score: WHOOP below 34 or Oura below 70 suggests easing; progression requires WHOOP at least 67/Oura at least 85 for every connected usable source, a non-limiting check-in with no soreness, and seven prior scored days in Strive. The seven-day gate and 12-hour sync freshness limit are Strive product rules, not a clinically validated readiness model. Limiting illness/pain/injury overrides device scores, low energy/high soreness suggests easing, missing/stale/calibrating data cannot suggest progression, and conflicting devices use the cautious signal. HRV and sleep are displayed as context; they do not independently prescribe load.

Progression means working toward the upper end of the user's existing rep range, not automatically increasing weight. The optional lighter session uses `max(1, floor(planned sets × 0.75))` for each exercise, with unchanged reps/rest. The user explicitly chooses this option, the server rechecks eligibility, and the resulting session retains the rationale. Existing sessions and saved templates are not rewritten. No medication, peptide or supplement dose recommendations are generated.

## Reference documentation

- [WHOOP OAuth and refresh](https://developer.whoop.com/docs/developing/oauth/), [WHOOP v2 API](https://developer.whoop.com/api/)
- [Oura OAuth and PKCE](https://cloud.ouraring.com/docs/authentication), [Oura OpenAPI schema](https://api.ouraring.com/v2/static/json/openapi-1.41.json)
- [WHOOP recovery bands](https://support.whoop.com/s/article/WHOOP-Recovery), [Oura readiness bands](https://support.ouraring.com/hc/en-us/articles/360025589793-An-Introduction-to-Your-Readiness-Score)
- [Expo SDK 57 WebBrowser](https://docs.expo.dev/versions/v57.0.0/sdk/webbrowser/)

## Hosted beta configuration (1 October 2026)

The installed native app uses https://strive-beta-api.onrender.com. Render already supplies the persistent database and integration encryption key; preserve the existing key.

Register these exact redirect URLs in the respective developer dashboards:

- WHOOP: `https://strive-beta-api.onrender.com/api/integrations/whoop/callback`
- Oura: `https://strive-beta-api.onrender.com/api/integrations/oura/callback`

The old WHOOP `http://localhost:8765/callback` can remain for the isolated development test. It does not work as the hosted native callback.

Store `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `OURA_CLIENT_ID`, and `OURA_CLIENT_SECRET` only in Render's backend environment. Save and redeploy after adding credentials. The installed native build already supports both providers; provider configuration alone does not require a new phone build.

Verification on October 1: all 10 wearable tests pass (simulated providers). WHOOP's hosted redirect is saved, its two credentials are stored in Render, and environment deployment `dep-dav8dgm7bikc73f5d1gg` is live. Both `/healthz` and `/readyz` return 200. A WHOOP callback probe with an intentionally unknown state returns 400 (expired/used sign-in), confirming configuration and database state validation are reached; this does not verify a real token exchange. WHOOP has a sandbox app with one of ten member slots used. Oura still returns 503 and developer sign-in/credentials are pending. Neither hosted account connection has been verified yet.

After configuration, sign into Strive on the phone, open Connect, authorize each provider, and verify return to Strive, successful first sync and recent readings on Home. Verify denial/cancellation and reconnect separately. Never paste passwords, client secrets or provider tokens into chat.
