// Supabase Edge Function: send Expo push notifications.
//
// Called by the app (with the user's JWT) on events the actor triggers:
//   • game invite created   -> notify the invitee
//   • invite accepted       -> notify the inviter
//   • new chat message       -> notify the rest of the roster
//   • game cancelled        -> notify the roster
//
// Time-based game reminders (~1h before kickoff) have no actor, so they run
// from a scheduled job (pg_cron) that invokes this same function server-side
// with the service role key — see docs/PRODUCTION_ROADMAP.md.
//
// Auth model:
//   • Every app call must carry the caller's bearer token. We validate it and,
//     for roster-wide sends (activityId), require the caller to be on that
//     roster — so nobody can spray push to an arbitrary game.
//   • Reading other users' push tokens needs the SERVICE ROLE key (server-only).
//
// Deploy:
//   supabase functions deploy send-notifications
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { captureError } from "../_shared/sentry.ts";

type Payload = {
  // Either target an activity's roster, or explicit user ids (or both).
  activityId?: string;
  userIds?: string[];
  // Never notify this user (e.g. the actor who triggered the event).
  excludeUserId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  try {
    const payload = (await req.json()) as Payload;
    if (!payload?.title || !payload?.body) {
      return json({ error: "title and body are required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    // --- Authenticate the caller ----------------------------------------
    // A service-role bearer = a trusted server call (the pg_cron reminder job).
    // It skips the user lookup + membership gate. Any other token must resolve
    // to a real user, who must be on the roster for activity-wide sends.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing authorization" }, 401);

    const trusted = jwt === serviceKey;
    let callerId: string | null = null;
    if (!trusted) {
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
      if (userErr || !userData?.user) return json({ error: "invalid token" }, 401);
      callerId = userData.user.id;
    }

    // --- Resolve recipients ---------------------------------------------
    let userIds = [...(payload.userIds ?? [])];

    if (payload.activityId) {
      // Roster-wide send: a real caller must be on that roster (trusted skips).
      if (!trusted) {
        const { data: membership } = await admin
          .from("activity_participants")
          .select("user_id")
          .eq("activity_id", payload.activityId)
          .eq("user_id", callerId)
          .eq("status", "joined")
          .maybeSingle();
        if (!membership) return json({ error: "not a participant" }, 403);
      }

      const { data: roster } = await admin
        .from("activity_participants")
        .select("user_id")
        .eq("activity_id", payload.activityId)
        .eq("status", "joined");
      userIds = [...userIds, ...(roster ?? []).map((r: any) => r.user_id)];
    }

    // Never notify the actor; de-dupe. (Trusted calls have no actor to exclude.)
    const exclude = payload.excludeUserId ?? callerId ?? "";
    userIds = [...new Set(userIds)].filter((id) => id && id !== exclude);

    if (userIds.length === 0) return json({ sent: 0 });

    const { data: tokens } = await admin
      .from("push_tokens")
      .select("token")
      .in("user_id", userIds);

    const messages = (tokens ?? []).map((t: any) => ({
      to: t.token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    // Expo push API accepts batches of up to 100.
    for (let i = 0; i < messages.length; i += 100) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    }

    return json({ sent: messages.length });
  } catch (e: any) {
    await captureError(e, { fn: "send-notifications" });
    return json({ error: e?.message ?? "unknown error" }, 500);
  }
});
