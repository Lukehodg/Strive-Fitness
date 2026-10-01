# Render private beta deployment

## Prepared, not deployed

On 1 October 2026, the signed-in Render dashboard showed:

| Resource | Configuration | Monthly base cost (USD) |
| --- | --- | --- |
| API | 0.5 CPU, 512 MB RAM | $7.00 |
| PostgreSQL | 0.1 CPU, 256 MB RAM | $6.00 |
| Database storage | 1 GB | $0.30 |
| Total | Before tax, extra usage and temporary restore instances | $13.30 |

The database and web-service forms are drafts only. No paid resource has been created. The existing unrelated Render service is not part of this deployment.

`render.yaml` describes both resources in Frankfurt, PostgreSQL 16 (matching CI), a private-only database, one API instance, migrations before deployment and a readiness probe. Auto-deployment and storage autoscaling are disabled. A sentinel invite address blocks real signups until the intended tester addresses are configured. The API is publicly reachable over HTTPS but account data requires authentication.

## Before applying

1. Review and publish the current overhaul branch to the existing Strive-Fitness repository, excluding local databases, test data, credentials and build outputs. The GitHub repository currently contains the old app; deploying its default branch would deploy the wrong version. GitHub CLI was not signed in at inspection time. Render already lists this repository under its existing GitHub connection.
2. Run the branch CI, including the Docker/PostgreSQL job. Do not consider local JavaScript bundle exports a container test.
3. Confirm the paid resource cost with the owner. Apply this Blueprint from `codex/overhaul-foundation`, rather than also submitting the manual draft forms and creating duplicate resources.
4. Render generates and retains `RENDER_INTEGRATION_KEY_BASE64`. The startup wrapper validates its 32-byte value and converts it to the application's hexadecimal key format without logging it. Do not rotate or remove it after connections exist. Do not copy local WHOOP test credentials or health records into this deployment.

## Verify the deployment

1. Confirm the migration completed and `/healthz` and `/readyz` both succeed over the assigned HTTPS URL. Verify an unauthenticated protected API request returns 401 and signup is blocked while the sentinel invite list is configured.
2. The startup wrapper derives `PUBLIC_API_URL` from Render's assigned HTTPS origin unless an explicit custom origin is supplied. Set that origin as `EXPO_PUBLIC_API_URL` in the mobile preview environment.
3. Replace the sentinel invite list with the owner's approved tester email addresses before creating beta accounts. Update the Blueprint's invite configuration if synchronizing it again, otherwise a later sync will reinstate the sentinel.
4. Confirm database external access remains disabled. Verify the database transport against Render's current connection instructions before admitting real data; do not silently bypass certificate checks.
5. Configure provider callback URLs and server secrets separately, then test native authorization. Adding hosting does not itself connect WHOOP, Oura or email.

## Backup and restore acceptance

Paid Render PostgreSQL provides point-in-time recovery; the Hobby workspace currently retains a three-day window. This is not yet verified for this deployment.

Use only disposable test records initially. Record a checkpoint, wait until it is eligible for recovery, restore into a separate temporary database, and verify schema/migration version and the test records. Render disallows restoration to a point less than ten minutes old. Keep the original database untouched. Record the restore timestamp and results before admitting real health data. A temporary restore database incurs additional prorated charges and should be removed after validation with the appropriate approval. Longer retention needs separately configured exports/storage.

References: [Blueprint specification](https://render.com/docs/blueprint-spec), [backup and recovery](https://render.com/docs/postgresql-backups), [private beta checklist](PRIVATE_BETA.md).
