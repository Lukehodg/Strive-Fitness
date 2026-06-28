import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { StravaAccount, StravaActivity } from "@/types/database";

const accountKey = (userId: string) => ["strava-account", userId] as const;
const activitiesKey = (userId: string) => ["strava-activities", userId] as const;

/** The signed-in user's Strava connection (status + athlete, never tokens). */
export function useStravaAccount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: accountKey(user?.id ?? "anon"),
    enabled: !!user,
    queryFn: async (): Promise<StravaAccount | null> => {
      const { data, error } = await supabase
        .from("strava_accounts")
        .select(
          "user_id, athlete_id, username, firstname, lastname, profile_url, scope, expires_at, created_at, updated_at",
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Recent activities for a user (their own profile, or anyone's once shown). */
export function useStravaActivities(userId: string | undefined) {
  return useQuery({
    queryKey: activitiesKey(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<StravaActivity[]> => {
      const { data, error } = await supabase
        .from("strava_activities")
        .select("*")
        .eq("user_id", userId!)
        .order("start_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  if (!userId) return;
  qc.invalidateQueries({ queryKey: accountKey(userId) });
  qc.invalidateQueries({ queryKey: activitiesKey(userId) });
}

/**
 * Finishes the OAuth handshake: hands the authorization `code` to the `strava`
 * Edge Function, which exchanges it for tokens (server-side) and does a first
 * sync. The app never sees the client secret or the tokens.
 */
export function useConnectStrava() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.functions.invoke("strava", {
        body: { action: "connect", code },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => invalidate(qc, user?.id),
  });
}

/** Pull the latest activities from Strava into our cache. */
export function useSyncStrava() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("strava", {
        body: { action: "sync" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => invalidate(qc, user?.id),
  });
}

/** Deauthorize at Strava and wipe the local connection + cached activities. */
export function useDisconnectStrava() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("strava", {
        body: { action: "disconnect" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => invalidate(qc, user?.id),
  });
}
