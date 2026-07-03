# Go-Live Checklist

A step-by-step to take this from "code on a branch" to "running on your phone
against the real backend". Most of it is the Supabase dashboard + `npx` commands
from the project folder — no new tools to install.

Your Supabase project ref is **`srpurixecxfuzyfoajmx`** (from the URL in
`app.json`). The dashboard is at
`https://supabase.com/dashboard/project/srpurixecxfuzyfoajmx`.

> ⚠️ **Never** paste the **service_role key** or any `*_SECRET` into the app,
> `app.json`, `.env` committed to git, or a chat. They are server-side only.

---

## Stage 0 — Prep (once)
1. Get the latest code on your laptop: `git pull` the branch, or download it.
2. In the project folder: `npm install`.

## Stage 1 — Database (Supabase dashboard → SQL Editor)
You've applied some migrations by hand already, so the migration history is
mixed — **keep using the SQL Editor** (don't use `db push`, it'll fight the
manual history).

1. **Enable extensions:** Database → Extensions → enable **`pg_cron`** and
   **`pg_net`** (needed for reminders).
2. **Apply migrations in order.** For each file in `supabase/migrations/` from
   `0001` → `0019`: open it, copy the contents, paste into a new SQL Editor
   query, Run.
   - If one errors with *"already exists"*, you've already applied it — skip it.
   - Run them **in numerical order**; later ones depend on earlier ones.
3. **Reminder secrets (Vault):** in the SQL Editor, run (service_role key is in
   Project Settings → API → `service_role`, the secret one):
   ```sql
   select vault.create_secret('https://srpurixecxfuzyfoajmx.supabase.co', 'project_url');
   select vault.create_secret('<your-service-role-key>', 'service_role_key');
   ```

## Stage 2 — Edge Functions (CLI, from the project folder)
The functions share a `_shared/sentry.ts` file, so deploy with the CLI (the
dashboard's single-file editor can't bundle the shared import).

```bash
npx supabase login                                   # opens browser, paste token
npx supabase link --project-ref srpurixecxfuzyfoajmx

npx supabase functions deploy send-notifications
npx supabase functions deploy strava
npx supabase functions deploy account
npx supabase functions deploy moderation
```

Secrets the functions need (only set the ones you're using):
```bash
# Strava (from https://www.strava.com/settings/api):
npx supabase secrets set STRAVA_CLIENT_ID=xxxx STRAVA_CLIENT_SECRET=xxxx
# Sentry (optional):
npx supabase secrets set SENTRY_DSN=xxxx
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions
automatically — you don't set those.

## Stage 3 — Auth (so you can actually sign in)
You need **at least one** working method. Pick the quickest for testing:

- **Phone OTP (usually quickest solo):** Authentication → Providers → Phone →
  enable, connect a **Twilio** account + number. A Twilio trial can text your
  own verified number for testing. _For real launch you need UK A2P
  registration — start that now, it's the slowest item (days–weeks)._
- **Apple:** Authentication → Providers → Apple → configure (Services ID + key
  from your Apple Developer account). Apple requires "Sign in with Apple" anyway.
- **Google (optional):** set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `_IOS_CLIENT_ID`.

## Stage 4 — Build & install on your iPhone
```bash
# Windows: set EAS_NO_VCS=1 first if git isn't installed
npx eas-cli build -p ios --profile preview
```
Open the link EAS prints on your phone and install. (This is the same flow you
used before; `preview` is a standalone build with everything embedded.)

## Stage 5 — Walk the whole loop (the real test)
Sign up → verify phone → create a game → see it on Discover → join → open chat →
invite a connection → confirm the push. **Note anything that breaks and send me
the exact error** — this is the first time any of it runs end to end.

---

## Optional integrations (layer in after the core works — all no-op until keyed)
- **Strava:** create the app, set callback domain `strive`, put the Client ID in
  `app.json` `extra.stravaClientId`, set the two secrets (Stage 2), rebuild.
- **Apple Health:** already wired — just needs the rebuild (Stage 4).
- **Sentry / PostHog:** set `EXPO_PUBLIC_SENTRY_DSN` / `EXPO_PUBLIC_POSTHOG_KEY`
  in `app.json` `extra` (and the Sentry function secret), rebuild.
- **Moderation:** after Stage 1–2, promote yourself:
  `update profiles set is_moderator = true where id = '<your-user-id>';`
  (your id is in Authentication → Users). Then call the `moderation` function.

See `SETUP.md` for the per-integration detail and `docs/PRODUCTION_ROADMAP.md`
for everything still beyond code (legal, store review, SMS A2P, liquidity).
