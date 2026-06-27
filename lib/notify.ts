import { supabase } from "@/lib/supabase";

export type NotifyInput = {
  /** Notify everyone joined on this game's roster. */
  activityId?: string;
  /** Notify these specific users. */
  userIds?: string[];
  /** Skip this user (defaults server-side to the caller). */
  excludeUserId?: string;
  title: string;
  body: string;
  /** Carried into the push payload; used for deep-linking on tap. */
  data?: Record<string, unknown>;
};

/**
 * Sends a push via the `send-notifications` Edge Function. Fire-and-forget:
 * notifications are a nicety, never block or fail the action that triggered
 * them. `invoke` attaches the signed-in user's JWT, which the function checks.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await supabase.functions.invoke("send-notifications", { body: input });
  } catch (e) {
    console.warn("[notify] send failed", e);
  }
}
