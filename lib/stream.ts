import { StreamChat } from "stream-chat";

import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";

/**
 * Stream Chat client (singleton). Tokens are minted server-side by the
 * `stream-token` Edge Function — the Stream API *secret* never touches the app.
 *
 * Channels are keyed to an activity id: `messaging:game-<activityId>`. Joining a
 * game adds you as a member (handled in useJoinActivity); leaving removes you.
 */
let client: StreamChat | null = null;

export function getStreamClient(): StreamChat {
  if (!client) {
    client = StreamChat.getInstance(env.streamApiKey);
  }
  return client;
}

/** Channel id helper — keep this the single source of truth for the mapping. */
export function channelIdForActivity(activityId: string): string {
  return `game-${activityId}`;
}

/**
 * Connect the current Supabase user to Stream using a server-minted token.
 * Safe to call repeatedly; no-ops if already connected as this user.
 */
export async function connectStreamUser(): Promise<StreamChat> {
  const sc = getStreamClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  if (sc.userID === user.id) return sc;

  const { data, error } = await supabase.functions.invoke<{ token: string }>(
    "stream-token",
  );
  if (error || !data?.token) {
    throw new Error(`Failed to mint Stream token: ${error?.message ?? "no token"}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  await sc.connectUser(
    {
      id: user.id,
      name: profile?.display_name ?? "Player",
      image: profile?.avatar_url ?? undefined,
    },
    data.token,
  );

  return sc;
}

export async function disconnectStreamUser(): Promise<void> {
  if (client?.userID) {
    await client.disconnectUser();
  }
}
