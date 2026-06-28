// Supabase Edge Function: Strava integration.
//
// The app does only the OAuth *authorize* step (via expo-auth-session) and
// sends us the resulting `code`. The code->token exchange and every refresh
// happen here, because they need the Strava CLIENT SECRET, which must never
// ship in the app bundle. We also fetch activities here and store STATS ONLY —
// no GPS / route — so profiles can't leak anyone's location.
//
// Actions (POST JSON body): { action: "connect" | "sync" | "disconnect", code? }
//
// Secrets (set once):
//   supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
// Deploy:
//   supabase functions deploy strava
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { captureError } from "../_shared/sentry.ts";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_DEAUTH_URL = "https://www.strava.com/oauth/deauthorize";
const STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities?per_page=15";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Privacy filter: copy only the stats we display. Never persist GPS/route.
function toRow(userId: string, a: any) {
  return {
    id: a.id,
    user_id: userId,
    name: a.name ?? null,
    sport_type: a.sport_type ?? a.type ?? null,
    distance_m: a.distance ?? null,
    moving_time_s: a.moving_time ?? null,
    elapsed_time_s: a.elapsed_time ?? null,
    total_elevation_gain: a.total_elevation_gain ?? null,
    average_speed: a.average_speed ?? null,
    start_date: a.start_date ?? null,
  };
}

async function fetchAndStoreActivities(admin: any, userId: string, accessToken: string) {
  const res = await fetch(STRAVA_ACTIVITIES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Strava activities ${res.status}`);
  const activities = (await res.json()) as any[];
  const rows = (activities ?? []).map((a) => toRow(userId, a));
  if (rows.length) {
    await admin.from("strava_activities").upsert(rows, { onConflict: "id" });
  }
  return rows;
}

// Returns a valid access token, refreshing + persisting if it has expired.
async function ensureToken(admin: any, account: any, clientId: string, clientSecret: string) {
  const stillValid = new Date(account.expires_at).getTime() - 60_000 > Date.now();
  if (stillValid) return account.access_token;

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`Strava refresh ${res.status}`);
  const t = await res.json();
  await admin
    .from("strava_accounts")
    .update({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(t.expires_at * 1000).toISOString(),
    })
    .eq("user_id", account.user_id);
  return t.access_token as string;
}

Deno.serve(async (req: Request) => {
  try {
    const { action, code } = (await req.json()) as { action?: string; code?: string };

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const clientId = Deno.env.get("STRAVA_CLIENT_ID");
    const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "Strava not configured" }, 500);

    // Authenticate the caller.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing authorization" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "invalid token" }, 401);

    // -- connect: exchange the auth code for tokens, store, first sync --------
    if (action === "connect") {
      if (!code) return json({ error: "missing code" }, 400);
      const res = await fetch(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
        }),
      });
      if (!res.ok) return json({ error: `Strava token exchange ${res.status}` }, 502);
      const t = await res.json();
      const ath = t.athlete ?? {};

      await admin.from("strava_accounts").upsert({
        user_id: caller.id,
        athlete_id: ath.id,
        username: ath.username ?? null,
        firstname: ath.firstname ?? null,
        lastname: ath.lastname ?? null,
        profile_url: ath.profile_medium ?? ath.profile ?? null,
        scope: t.scope ?? null,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: new Date(t.expires_at * 1000).toISOString(),
      });

      try {
        await fetchAndStoreActivities(admin, caller.id, t.access_token);
      } catch (_e) {
        // first sync is best-effort; the account is still connected
      }

      return json({
        connected: true,
        athlete: {
          athlete_id: ath.id,
          username: ath.username ?? null,
          firstname: ath.firstname ?? null,
          lastname: ath.lastname ?? null,
        },
      });
    }

    // -- sync: refresh the activity cache for the caller ----------------------
    if (action === "sync") {
      const { data: account } = await admin
        .from("strava_accounts")
        .select("*")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (!account) return json({ error: "not connected" }, 404);

      const token = await ensureToken(admin, account, clientId, clientSecret);
      const rows = await fetchAndStoreActivities(admin, caller.id, token);
      return json({ synced: rows.length });
    }

    // -- disconnect: deauthorize at Strava + wipe local data -----------------
    if (action === "disconnect") {
      const { data: account } = await admin
        .from("strava_accounts")
        .select("*")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (account) {
        try {
          await fetch(STRAVA_DEAUTH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ access_token: account.access_token }),
          });
        } catch (_e) {
          // best-effort revoke; we still clear our side
        }
      }
      await admin.from("strava_activities").delete().eq("user_id", caller.id);
      await admin.from("strava_accounts").delete().eq("user_id", caller.id);
      return json({ disconnected: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    await captureError(e, { fn: "strava" });
    return json({ error: e?.message ?? "unknown error" }, 500);
  }
});
