import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { EmptyState, Loading, Muted, Screen } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useActivity, useRoster, type RosterEntry } from "@/hooks/useActivity";
import { useConnections, type Connection } from "@/hooks/useConnections";
import { useGameInviteStatuses, useInviteToGame } from "@/hooks/useInvites";
import { useMyProfile } from "@/hooks/useProfile";
import type { InviteStatus } from "@/types/database";

type CandidateState = "on_roster" | InviteStatus | "none";

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activityId = id!;

  const { data: game } = useActivity(activityId);
  const { data: profile } = useMyProfile();
  const connections = useConnections();
  const { data: roster } = useRoster(activityId);
  const { data: inviteStatuses } = useGameInviteStatuses(activityId);
  const invite = useInviteToGame(activityId);

  if (connections.isLoading) return <Loading />;

  const list = connections.data ?? [];
  const rosterIds = new Set((roster ?? []).map((r: RosterEntry) => r.user_id));

  function stateFor(c: Connection): CandidateState {
    if (rosterIds.has(c.id)) return "on_roster";
    return inviteStatuses?.[c.id] ?? "none";
  }

  async function onInvite(c: Connection) {
    if (!game) return;
    try {
      await invite.mutateAsync({
        inviteeId: c.id,
        gameTitle: game.title,
        inviterName: profile?.display_name ?? "A mate",
      });
    } catch (e) {
      Alert.alert("Couldn't invite", e instanceof Error ? e.message : "Try again.");
    }
  }

  if (list.length === 0) {
    return (
      <Screen edges={["bottom", "left", "right"]}>
        <EmptyState
          icon="people-outline"
          title="No connections yet"
          message="Add mates with “Play again” after a game, then invite them straight into your next one."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom", "left", "right"]}>
      <FlatList
        data={list}
        keyExtractor={(c: Connection) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Muted>
            {game ? `Invite a connection to ${game.title}.` : "Invite a connection."}
          </Muted>
        }
        renderItem={({ item }: { item: Connection }) => {
          const state = stateFor(item);
          return (
            <View style={styles.row}>
              <Avatar name={item.display_name} url={item.avatar_url} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                {item.area_label ? <Text style={styles.area}>{item.area_label}</Text> : null}
              </View>
              <InviteAction
                state={state}
                pending={invite.isPending}
                onPress={() => onInvite(item)}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}

function InviteAction({
  state,
  pending,
  onPress,
}: {
  state: CandidateState;
  pending: boolean;
  onPress: () => void;
}) {
  if (state === "on_roster" || state === "accepted") {
    return <Pill label="Going" tone="done" />;
  }
  if (state === "pending") {
    return <Pill label="Invited" tone="muted" onPress={onPress} />;
  }
  // none / declined / cancelled — offer (re-)invite
  return <Pill label={pending ? "…" : "Invite"} tone="primary" onPress={onPress} />;
}

function Pill({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: "primary" | "muted" | "done";
  onPress?: () => void;
}) {
  const bg =
    tone === "primary" ? colors.primary : tone === "done" ? colors.surfaceAlt : colors.surface;
  const fg = tone === "primary" ? colors.primaryText : colors.ember;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: pressed && onPress ? 0.85 : 1 },
        tone !== "primary" && styles.pillBordered,
      ]}
    >
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(5), gap: spacing(3) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3.5),
  },
  name: { color: colors.text, fontSize: 16, fontFamily: fonts.bodyBold },
  area: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  pill: {
    minWidth: 78,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(3),
  },
  pillBordered: { borderWidth: 1, borderColor: colors.border },
  pillText: { fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
});
