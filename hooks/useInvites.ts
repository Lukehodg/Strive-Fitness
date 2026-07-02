import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/notify";
import { capture } from "@/lib/analytics";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { ActivityStatus, InviteStatus } from "@/types/database";

/** An invite waiting in the signed-in user's inbox. */
export type MyInvite = {
  id: string;
  activity_id: string;
  inviter_id: string;
  inviter_name: string;
  inviter_avatar: string | null;
  game_title: string;
  starts_at: string;
  venue_label: string;
  game_status: ActivityStatus;
};

const myInvitesKey = (userId: string) => ["my-invites", userId] as const;
const gameInvitesKey = (activityId: string) => ["game-invites", activityId] as const;

/**
 * Statuses of invites already sent for a game, keyed by invitee id. Lets the
 * invite screen show "Invited" / "Joined" instead of re-offering people.
 */
export function useGameInviteStatuses(activityId: string) {
  return useQuery({
    queryKey: gameInvitesKey(activityId),
    enabled: !!activityId,
    queryFn: async (): Promise<Record<string, InviteStatus>> => {
      const { data, error } = await supabase
        .from("game_invites")
        .select("invitee_id, status")
        .eq("activity_id", activityId);
      if (error) throw error;

      type Row = { invitee_id: string; status: InviteStatus };
      const map: Record<string, InviteStatus> = {};
      for (const r of (data ?? []) as Row[]) map[r.invitee_id] = r.status;
      return map;
    },
  });
}

/** Invite a connection into a game, then nudge them with a push. */
export function useInviteToGame(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      inviteeId: string;
      gameTitle: string;
      inviterName: string;
    }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("game_invites").upsert(
        {
          activity_id: activityId,
          inviter_id: user.id,
          invitee_id: input.inviteeId,
          status: "pending",
        },
        { onConflict: "activity_id,invitee_id" },
      );
      if (error) throw error;

      // Fire-and-forget: the invite is saved; the push can land when it lands.
      void notify({
        userIds: [input.inviteeId],
        title: "⚽ Game invite",
        body: `${input.inviterName} invited you to ${input.gameTitle}`,
        data: { type: "invite" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gameInvitesKey(activityId) });
    },
  });
}

/**
 * Rally the crew: invite a whole list of connections in one go (one upsert,
 * one push). The screen passes only invitable candidates — people not already
 * on the roster or holding a pending/accepted invite.
 */
export function useRallyCrew(activityId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      inviteeIds: string[];
      gameTitle: string;
      inviterName: string;
    }): Promise<number> => {
      if (!user) throw new Error("Not signed in");
      if (input.inviteeIds.length === 0) return 0;

      const rows = input.inviteeIds.map((invitee_id) => ({
        activity_id: activityId,
        inviter_id: user.id,
        invitee_id,
        status: "pending" as const,
      }));
      const { error } = await supabase
        .from("game_invites")
        .upsert(rows, { onConflict: "activity_id,invitee_id" });
      if (error) throw error;

      void notify({
        userIds: input.inviteeIds,
        title: "⚽ Game invite",
        body: `${input.inviterName} invited you to ${input.gameTitle}`,
        data: { type: "invite" },
      });
      capture("crew_rallied", { activityId, count: input.inviteeIds.length });
      return input.inviteeIds.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: gameInvitesKey(activityId) });
    },
  });
}

/** Pending invites addressed to the signed-in user. */
export function useMyInvites() {
  const { user } = useAuth();
  return useQuery({
    queryKey: myInvitesKey(user?.id ?? "anon"),
    enabled: !!user,
    queryFn: async (): Promise<MyInvite[]> => {
      const { data, error } = await supabase
        .from("game_invites")
        .select(
          "id, activity_id, inviter_id, " +
            "activity:activities!game_invites_activity_id_fkey(title, starts_at, venue_label, status), " +
            "inviter:profiles!game_invites_inviter_id_fkey(display_name, avatar_url)",
        )
        .eq("invitee_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;

      type Row = {
        id: string;
        activity_id: string;
        inviter_id: string;
        activity: {
          title: string;
          starts_at: string;
          venue_label: string;
          status: ActivityStatus;
        } | null;
        inviter: { display_name: string; avatar_url: string | null } | null;
      };

      return (data as unknown as Row[])
        .filter((r) => r.activity && r.activity.status !== "cancelled")
        .map((r) => ({
          id: r.id,
          activity_id: r.activity_id,
          inviter_id: r.inviter_id,
          inviter_name: r.inviter?.display_name ?? "Someone",
          inviter_avatar: r.inviter?.avatar_url ?? null,
          game_title: r.activity!.title,
          starts_at: r.activity!.starts_at,
          venue_label: r.activity!.venue_label,
          game_status: r.activity!.status,
        }));
    },
  });
}

/** Lightweight count for the Profile badge. */
export function usePendingInviteCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...myInvitesKey(user?.id ?? "anon"), "count"],
    enabled: !!user,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("game_invites")
        .select("*", { count: "exact", head: true })
        .eq("invitee_id", user!.id)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * Accept or decline an invite. Accepting joins the roster (RLS still enforces
 * phone verification) and pings the inviter; declining just closes the invite.
 */
export function useRespondToInvite() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      invite: MyInvite;
      accept: boolean;
      myName: string;
    }) => {
      if (!user) throw new Error("Not signed in");
      const { invite, accept } = input;

      if (accept) {
        // Join first — if verification blocks it, we don't mark accepted.
        const { error: joinErr } = await supabase
          .from("activity_participants")
          .upsert({ activity_id: invite.activity_id, user_id: user.id, status: "joined" });
        if (joinErr) {
          if (joinErr.code === "42501" || joinErr.message.includes("row-level security")) {
            throw new Error("Verify your phone number before joining games.");
          }
          throw joinErr;
        }
      }

      const { error } = await supabase
        .from("game_invites")
        .update({ status: accept ? "accepted" : "declined" })
        .eq("id", invite.id)
        .eq("invitee_id", user.id);
      if (error) throw error;

      if (accept) {
        void notify({
          userIds: [invite.inviter_id],
          title: "✅ Invite accepted",
          body: `${input.myName} is in for ${invite.game_title}`,
          data: { type: "game", activityId: invite.activity_id },
        });
      }
    },
    onSuccess: (_data, { invite }) => {
      if (user) {
        qc.invalidateQueries({ queryKey: myInvitesKey(user.id) });
        qc.invalidateQueries({ queryKey: queryKeys.myGames(user.id) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.activity(invite.activity_id) });
      qc.invalidateQueries({ queryKey: queryKeys.roster(invite.activity_id) });
      qc.invalidateQueries({ queryKey: ["nearby"] });
    },
  });
}
