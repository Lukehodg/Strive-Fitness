// Supabase Edge Function: moderation tools (moderator-only).
//
// Actions (POST JSON { action, ... }):
//   "list_reports"  { status? }            -> reports + reporter/reported names
//   "set_status"    { reportId, status }   -> triage a report
//   "suspend"       { userId, reason? }     -> set profiles.suspended_at = now()
//   "unsuspend"     { userId }             -> clear the suspension
//
// JWT-authenticated AND gated on profiles.is_moderator. Uses the service role
// to read across users, but only after confirming the caller is a moderator.
//
// Deploy: supabase functions deploy moderation
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { captureError } from "../_shared/sentry.ts";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const STATUSES = ["open", "reviewed", "actioned", "dismissed"];

Deno.serve(async (req: Request) => {
  try {
    const body = (await req.json()) as {
      action?: string;
      status?: string;
      reportId?: string;
      userId?: string;
      reason?: string;
    };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "missing authorization" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "invalid token" }, 401);

    // Gate: the caller must be a moderator.
    const { data: me } = await admin
      .from("profiles")
      .select("is_moderator")
      .eq("id", caller.id)
      .maybeSingle();
    if (!me?.is_moderator) return json({ error: "forbidden" }, 403);

    const { action } = body;

    if (action === "list_reports") {
      let q = admin
        .from("reports")
        .select(
          "id, reason, details, status, created_at, activity_id, " +
            "reporter:profiles!reports_reporter_id_fkey(id, display_name), " +
            "reported:profiles!reports_reported_user_id_fkey(id, display_name, suspended_at)",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (body.status) q = q.eq("status", body.status);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ reports: data ?? [] });
    }

    if (action === "set_status") {
      if (!body.reportId || !body.status || !STATUSES.includes(body.status)) {
        return json({ error: "reportId + valid status required" }, 400);
      }
      const { error } = await admin
        .from("reports")
        .update({ status: body.status, reviewed_at: new Date().toISOString(), reviewed_by: caller.id })
        .eq("id", body.reportId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "suspend" || action === "unsuspend") {
      if (!body.userId) return json({ error: "userId required" }, 400);
      if (body.userId === caller.id) return json({ error: "can't suspend yourself" }, 400);
      const { error } = await admin
        .from("profiles")
        .update({ suspended_at: action === "suspend" ? new Date().toISOString() : null })
        .eq("id", body.userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, suspended: action === "suspend" });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    await captureError(e, { fn: "moderation" });
    return json({ error: e?.message ?? "unknown error" }, 500);
  }
});
