# Strive for iOS and Android

This is the primary product: a React Native app on Expo SDK 57, using Expo Router. The root web client is a development companion, not the mobile release.

## Run

Use Node.js 22.13 or newer. In this directory:

```sh
npm ci
```

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to a reachable Strive backend. Start the backend from the repository root with `npm run dev`. A physical phone's `localhost` refers to the phone, not your PC. For LAN development set the backend's `HOST=0.0.0.0`, configure the phone with your PC's LAN address, and use a trusted development network. Prefer an HTTPS development server; release builds reject HTTP API addresses.

```sh
npm start
```

Use an Expo development build for wearable account linking; rebuild after adding `expo-web-browser`. Expo Go can be used for supported manual-tracking checks but is not the acceptance environment for the `strivefitness` OAuth return scheme. An iOS simulator requires macOS; Windows can run Android tooling or use an iPhone with a compatible development build. No app-store build has been submitted.

## Implemented in the first native milestone

- Native registration/sign-in and protected bottom-tab navigation.
- Revocable bearer sessions stored with Expo SecureStore; no passwords or provider secrets in the app bundle.
- Today: live nutrition totals and a saved energy/soreness/limitation check-in.
- Food: manual food entry with calories and macros, and today's saved meals.
- Train: create strength workouts with exercise search, ordering, rep ranges, rest targets and weekly scheduling; start/resume sessions, save sets and review completed history.
- Health: create/edit supplements, peptides and medication records; archive/restore routines and record taken/skipped events with a preserved dose history.
- Connections: system-browser WHOOP/Oura sign-in, real sync status, reconnect and disconnect/removal; unavailable providers show setup pending. Email remains planned.
- Today/Train: explained recovery/readiness suggestions and optional lighter sessions, with preserved reasons in session history.

The offline queue, timed regimen reminders and cardio-specific logging remain to be built. Wearable syncing runs on the server; it does not depend on phone background execution. See [wearable setup](../WEARABLE_SETUP.md) for server credentials and required live checks. Routine schedules are descriptive text for now; recorded events do not generate recurring reminders. Strive login sessions expire after seven days and require sign-in again; app session refresh is not yet implemented (provider credential refresh is). A failed network sign-out keeps the session visible so the user can retry revocation.

## Validation

```sh
npm run check
npm run lint
npx expo export --platform all
npx expo-doctor
```

Export validates JavaScript bundles for both platforms; it does not replace installing signed builds on iPhone and Android. Before distribution, choose owner-controlled application identifiers, link an EAS project, configure API environments and signing, replace placeholder app icons, and run device accessibility, lifecycle, keyboard and safe-area checks. `eas.json` includes development/preview/production profiles but does not configure accounts or signing.

References: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Router installation](https://docs.expo.dev/router/installation/).
