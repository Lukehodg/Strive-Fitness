// Supabase Edge Function: account data rights (GDPR).
//
// Actions (POST JSON { action }):
//   "export" — returns a JSON bundle of everything we hold about the caller
//              (right of access / portability).
//   "delete" — erases the account: best-effort Strava deauth + avatar cleanup,
//              then deletes the auth user, which CASCADES every DB row (all our
//              tables reference profiles(id) -> auth.users(id) ON DELETE CASCADE).
//
// JWT-authenticated; uses the service role so it can read/delete across the
// caller's own rows. A user can only ever export/delete THEMSELVES.
//
// Deploy: supabase functions deploy account
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  try {
    const { action } = (await req.json()) as { action?: string };

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing authorization" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "invalid token" }, 401);
    const uid = caller.id;

    // ----- export: gather everything we hold on the caller --------------------
    if (action === "export") {
      const grab = (q: any) => q.then((r: any) => r.data ?? []);
      const [
        profile,
        hostedActivities,
        participations,
        messages,
        connections,
        invitesSent,
        invitesReceived,
        rsvps,
        blocks,
        reportsFiled,
        stravaActivities,
      ] = await Promise.all([
        admin.from("profiles").select("*").eq("id", uid).maybeSingle().then((r: any) => r.data),
        grab(admin.from("activities").select("*").eq("host_id", uid)),
        grab(admin.from("activity_participants").select("*").eq("user_id", uid)),
        grab(admin.from("messages").select("*").eq("user_id", uid)),
        grab(admin.from("connections").select("*").eq("user_id", uid)),
        grab(admin.from("game_invites").select("*").eq("inviter_id", uid)),
        grab(admin.from("game_invites").select("*").eq("invitee_id", uid)),
        grab(admin.from("event_attendees").select("*").eq("user_id", uid)),
        grab(admin.from("blocks").select("*").eq("blocker_id", uid)),
        grab(admin.from("reports").select("*").eq("reporter_id", uid)),
        grab(admin.from("strava_activities").select("*").eq("user_id", uid)),
      ]);

      return json({
        exported_at: new Date().toISOString(),
        account: { id: uid, email: caller.email ?? null, phone: caller.phone ?? null },
        profile,
        hosted_activities: hostedActivities,
        participations,
        messages,
        connections,
        invites_sent: invitesSent,
        invites_received: invitesReceived,
        event_rsvps: rsvps,
        blocks,
        reports_filed: reportsFiled,
        strava_activities: stravaActivities,
      });
    }

    // ----- delete: erase the account -----------------------------------------
    if (action === "delete") {
      // Best-effort: revoke Strava so we leave no dangling third-party grant.
      const { data: strava } = await admin
        .from("strava_accounts")
        .select("access_token")
        .eq("user_id", uid)
        .maybeSingle();
      if (strava?.access_token) {
        try {
          await fetch("https://www.strava.com/oauth/deauthorize", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ access_token: strava.access_token }),
          });
        } catch (_e) {
          // ignore; the row is deleted below regardless
        }
      }

      // Best-effort: remove the user's avatar files (storage isn't cascaded).
      try {
        const { data: files } = await admin.storage.from("avatars").list(uid);
        if (files?.length) {
          await admin.storage.from("avatars").remove(files.map((f: any) => `${uid}/${f.name}`));
        }
      } catch (_e) {
        // ignore storage cleanup failures
      }

      // Deletes auth.users row -> cascades every public table via FK.
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (error) return json({ error: error.message }, 500);
      return json({ deleted: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "unknown error" }, 500);
  }
});
