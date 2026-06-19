// Supabase Edge Function: mint a Stream Chat user token.
//
// The Stream API *secret* lives only here (set via `supabase secrets set`).
// The app calls this with its Supabase JWT; we trust the verified user id from
// that JWT and never accept a user id from the request body.
//
// Deploy:
//   supabase functions deploy stream-token
//   supabase secrets set STREAM_API_KEY=... STREAM_API_SECRET=...
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { StreamChat } from "https://esm.sh/stream-chat@8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Resolve the caller from their Supabase JWT (anon client + the user's token).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return json({ error: "Not authenticated" }, 401);
    }

    const apiKey = Deno.env.get("STREAM_API_KEY")!;
    const apiSecret = Deno.env.get("STREAM_API_SECRET")!;
    const serverClient = StreamChat.getInstance(apiKey, apiSecret);

    // Ensure the Stream user exists, then issue a token bound to their id.
    await serverClient.upsertUser({ id: user.id });
    const token = serverClient.createToken(user.id);

    return json({ token }, 200);
  } catch (e: any) {
    return json({ error: e?.message ?? "Unexpected error" }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
