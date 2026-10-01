# Render private beta deployment

## Deployment status — 1 October 2026

The owner approved these services with a $20 first-month budget including a temporary recovery test. The API and database have been created in Frankfurt.

- API: https://strive-beta-api.onrender.com
- Render service: `srv-dav7467pn0mc73afsoi0`
- Database: `dpg-dav73onpn0mc73afqqn0-a`
- Blueprint: `exs-dav73hbncjis739hmfr0`
- Recovery verification revision: `136f7f1`; final live revision: `e81a382`. All GitHub CI jobs passed for both revisions.
- Verified HTTPS health/readiness 200, protected endpoints 401, uninvited signup 403, HTTP-to-HTTPS redirect and database external access blocked.
- Live database baseline: TLS 1.3; 9 migrations; 28 public tables; 87 exercise catalogue records.
- Backup export completed (1 October, 14:54 UTC). Point-in-time recovery restored a separate database to 14:51:25 UTC. The restored database connected over TLS 1.3 and matched all three baseline SHA-256 digests below. The owner approved deletion of this temporary copy after verification; cleanup is confirmed and only the original API/database remain active.

| Recovery evidence | Live and restored digest |
| --- | --- |
| 9 migrations | `d73aad43ce6d275859e23e0c7d4352237fbada7d8738d2a0b1826ac385e4ab78` |
| 87 exercises | `d625190e2c9a86318409d8d5c448d95e948dc2221d8b4c6a46acc104342f7b76` |
| 28 public table names | `db3ef6e173dfe5462bf8e68d69acbfbe822c84455d540e0fd50d1b2457cdc18f` |

The comparison was read-only and used disposable catalogue/schema data, not user health records. `scripts/verify-render-database.mjs` prints counts and hashes without credentials or user records. The application stayed connected to the original database throughout. The approved invitation address is held only in Render's private environment; it is not committed here. The final running process verified that its invite list matches the approved address and database TLS is required. Final health/readiness checks passed, unauthenticated access returned 401, and unrelated signup remained blocked with 403. The user still needs to create their own beta account and password.

## Approved resource costs

On 1 October 2026, the signed-in Render dashboard showed:

| Resource | Configuration | Monthly base cost (USD) |
| --- | --- | --- |
| API | 0.5 CPU, 512 MB RAM | $7.00 |
| PostgreSQL | 0.1 CPU, 256 MB RAM | $6.00 |
| Database storage | 1 GB | $0.30 |
| Total | Before tax, extra usage and temporary restore instances | $13.30 |

The API and database now incur these charges. The existing unrelated Render service is not part of this deployment.

`render.yaml` describes both resources in Frankfurt, PostgreSQL 16 (matching CI), a private-only database, one API instance, migrations before deployment and a readiness probe. Auto-deployment and storage autoscaling are disabled. A sentinel invite address blocks real signups until the intended tester addresses are configured. The API is publicly reachable over HTTPS but account data requires authentication.

## Before applying

1. Use the published `codex/overhaul-foundation` branch in the existing Strive-Fitness repository. The default branch still contains the old app. Local databases, test data, credentials and build outputs are excluded. Render uses its existing GitHub connection.
2. Run the branch CI, including the Docker/PostgreSQL job. Do not consider local JavaScript bundle exports a container test.
3. Confirm the paid resource cost with the owner. Apply this Blueprint from `codex/overhaul-foundation`, rather than also submitting the manual draft forms and creating duplicate resources.
4. Render generates and retains `RENDER_INTEGRATION_KEY_BASE64`. The startup wrapper validates its 32-byte value and converts it to the application's hexadecimal key format without logging it. Do not rotate or remove it after connections exist. Do not copy local WHOOP test credentials or health records into this deployment.

## Verify the deployment

1. Confirm the migration completed and `/healthz` and `/readyz` both succeed over the assigned HTTPS URL. Verify an unauthenticated protected API request returns 401 and signup is blocked while the sentinel invite list is configured.
2. The startup wrapper derives `PUBLIC_API_URL` from Render's assigned HTTPS origin unless an explicit custom origin is supplied. Set that origin as `EXPO_PUBLIC_API_URL` in the mobile preview environment.
3. Replace the initial sentinel invite list with the owner's approved tester email addresses before creating beta accounts. The Blueprint now uses `sync: false` so later syncs preserve the privately configured invite list. New installations must supply their list at Blueprint creation.
4. Confirm database external access remains disabled. Verify the database transport against Render's current connection instructions before admitting real data; do not silently bypass certificate checks.
5. Configure provider callback URLs and server secrets separately, then test native authorization. Adding hosting does not itself connect WHOOP, Oura or email.

## Backup and restore acceptance

Paid Render PostgreSQL provides point-in-time recovery; this deployment's Hobby workspace shows a three-day window. An actual restore and comparison passed as recorded above.

Use only disposable test records initially. Record a checkpoint, wait until it is eligible for recovery, restore into a separate temporary database, and verify schema/migration version and the test records. Render disallows restoration to a point less than ten minutes old. Keep the original database untouched. Record the restore timestamp and results before admitting real health data. A temporary restore database incurs additional prorated charges and should be removed after validation with the appropriate approval. Longer retention needs separately configured exports/storage.

References: [Blueprint specification](https://render.com/docs/blueprint-spec), [backup and recovery](https://render.com/docs/postgresql-backups), [private beta checklist](PRIVATE_BETA.md).
