// Supabase Edge Function: send Expo push notifications.
//
// Sprint 6 scaffold. Two intended triggers:
//   1) Game reminders — invoke on a schedule (pg_cron / Supabase scheduled
//      function) to nudge participants ~1h before `starts_at`.
//   2) Chat nudges — call from a Stream webhook on new messages.
//
// This uses the SERVICE ROLE key (server-only) to read tokens across users.
// Deploy:
//   supabase functions deploy send-notifications
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Payload = {
  // Either target an activity's roster, or explicit user ids.
  activityId?: string;
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

Deno.serve(async (req: Request) => {
  try {
    const payload = (await req.json()) as Payload;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userIds = payload.userIds ?? [];
    if (payload.activityId) {
      const { data } = await admin
        .from("activity_participants")
        .select("user_id")
        .eq("activity_id", payload.activityId)
        .eq("status", "joined");
      userIds = [...userIds, ...(data ?? []).map((r: any) => r.user_id)];
    }
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

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

    return new Response(JSON.stringify({ sent: messages.length }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
  }
});
