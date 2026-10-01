# iPhone preview builds

Preview API: https://strive-beta-api.onrender.com (configured in the EAS preview environment).
Expo project: @lukehodg/strive-fitness. Bundle: com.lukehodg.strivefitness.
Saved distribution credentials and the registered iPhone can be reused.

From the `mobile` directory:

```powershell
npx eas-cli@latest build --platform ios --profile preview
```

## Health overview — 1 October 2026

Today now starts with provider-specific recovery/readiness, sleep, HRV and resting heart rate cards, seven-day history, source and sync labels. A separate check-in refreshes the training guidance. Food and routine summaries open their existing screens. Missing or stale current readings stay blank, while labelled history remains accessible.

WHOOP resting heart rate requires a fresh sync to backfill recent records. Oura resting heart rate is not imported. Native Apple Health and Health Connect are not included in this release.

Verification: 54 backend tests, root TypeScript/build, native TypeScript/lint and both iOS and Android JavaScript exports passed. Physical-device validation remains outstanding.

Phone acceptance:

1. Install the new preview, sign in and open Today.
2. In Connections, run WHOOP Sync now. Return to Today and pull to refresh.
3. Compare the dated recovery, sleep, HRV and resting heart rate with WHOOP.
4. Tap each card; confirm dates, units and gaps in its seven-day history.
5. Save a check-in and verify training guidance refreshes. Resume/review an existing workout.
6. Background and reopen the app; verify readings refresh. Check large text and scrolling.
7. Verify disconnected, missing-day and overdue-sync states when those occur; no invented values should appear.

## Earlier previews

Home A: https://expo.dev/accounts/lukehodg/projects/strive-fitness/builds/63370316-3d46-47ee-906f-de2b14a14f8f

Barcode/workout update: https://expo.dev/accounts/lukehodg/projects/strive-fitness/builds/6b96a233-1b18-4dc6-9fd0-df8b9b5d3d6a

These include Open Food Facts barcode lookup and compact workout set rows. The newer food-logging concept and AI workout creation are separate pending work.

## Latest health-overview build

Submitted: https://expo.dev/accounts/lukehodg/projects/strive-fitness/builds/cd88e264-0a7c-45c4-85a3-696c0e1e8cd9
Source commit: 82c1936. Build completion and phone acceptance remain to be verified.
Backend e62c16c deployed successfully on Render (dep-dava33t9fdbs73bfoou0); migration completed, readiness returned HTTP 200, and anonymous health-overview access returned HTTP 401.
