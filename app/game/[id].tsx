import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, Card, Heading, Loading, Muted, Screen, Subheading } from "@/components/ui";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import {
  statusLabel,
  useActivity,
  useCancelActivity,
  useJoinActivity,
  useLeaveActivity,
  useRoster,
  type RosterEntry,
} from "@/hooks/useActivity";
import { useAddConnection, useBlockUser, useReportUser } from "@/hooks/useSafety";
import { formatCountdown, formatRoster, formatStartTime } from "@/lib/format";

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const activityId = id!;
  const router = useRouter();
  const { user } = useAuth();
  const { data: profile } = useMyProfile();

  const { data: game, isLoading } = useActivity(activityId);
  const { data: roster } = useRoster(activityId);
  const join = useJoinActivity(activityId);
  const leave = useLeaveActivity(activityId);
  const cancel = useCancelActivity(activityId);
  const block = useBlockUser();
  const report = useReportUser();
  const addConnection = useAddConnection();

  if (isLoading || !game) return <Loading />;

  const amIn = !!roster?.some((r: RosterEntry) => r.user_id === user?.id);
  const isHost = game.host_id === user?.id;
  const isFull = game.status === "full";
  const isCancelled = game.status === "cancelled";
  const isPast = +new Date(game.starts_at) + game.duration_minutes * 60_000 < Date.now();
  const verified = profile?.phone_verified ?? false;

  async function onShare() {
    if (!game) return;
    try {
      await Share.share({
        message:
          `${game.title} — ${game.venue_label}\n${formatStartTime(game.starts_at)}\n` +
          `Join me on Strive: strive://game/${activityId}`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }

  function onCancel() {
    Alert.alert("Cancel this game?", "Everyone on the roster will see it's been called off.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel game",
        style: "destructive",
        onPress: async () => {
          try {
            await cancel.mutateAsync();
          } catch (e) {
            Alert.alert("Couldn't cancel", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  async function onJoin() {
    if (!verified) {
      Alert.alert("Verify first", "Verify your phone number before joining games.", [
        { text: "Not now", style: "cancel" },
        { text: "Verify", onPress: () => router.push("/(auth)/verify-phone") },
      ]);
      return;
    }
    try {
      await join.mutateAsync();
    } catch (e) {
      Alert.alert("Couldn't join", e instanceof Error ? e.message : "Try again.");
    }
  }

  async function onLeave() {
    try {
      await leave.mutateAsync();
    } catch (e) {
      Alert.alert("Couldn't leave", e instanceof Error ? e.message : "Try again.");
    }
  }

  function onReport(userId: string, name: string) {
    Alert.alert(`Report ${name}`, "This sends a report to our safety team.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Report",
        style: "destructive",
        onPress: async () => {
          await report.mutateAsync({ reportedUserId: userId, activityId, reason: "inappropriate" });
          Alert.alert("Reported", "Thanks — we'll review this.");
        },
      },
    ]);
  }

  function onBlock(userId: string, name: string) {
    Alert.alert(`Block ${name}?`, "They won't see you or your games, and you won't see theirs.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          await block.mutateAsync(userId);
          Alert.alert("Blocked", `${name} is blocked.`);
        },
      },
    ]);
  }

  function playerActions(entry: RosterEntry) {
    if (entry.user_id === user?.id) return;
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
      { text: "Cancel", style: "cancel" },
      { text: "Report", style: "destructive", onPress: () => onReport(entry.user_id, entry.display_name) },
      { text: "Block", style: "destructive", onPress: () => onBlock(entry.user_id, entry.display_name) },
    ];
    if (isPast) {
      buttons.splice(1, 0, {
        text: "Play again (add)",
        onPress: async () => {
          await addConnection.mutateAsync(entry.user_id);
          Alert.alert("Added", `${entry.display_name} added for future games.`);
        },
      });
    }
    Alert.alert(entry.display_name, entry.area_label ?? undefined, buttons);
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Heading>{game.title}</Heading>
          <View style={styles.titleActions}>
            <Ionicons
              name="share-outline"
              size={22}
              color={colors.textMuted}
              onPress={onShare}
            />
            <View style={[styles.badge, isFull && styles.badgeFull]}>
              <Text style={[styles.badgeText, isFull && styles.badgeTextFull]}>
                {statusLabel(game.status)}
              </Text>
            </View>
          </View>
        </View>

        {!isCancelled ? (
          <Text style={styles.countdown}>{formatCountdown(game.starts_at, game.duration_minutes)}</Text>
        ) : null}

        <Card style={{ gap: spacing(2.5) }}>
          <Row icon="time" text={formatStartTime(game.starts_at)} />
          <Row icon="hourglass" text={`${game.duration_minutes} min`} />
          <Row icon="location" text={game.venue_label} />
          <Row icon="people" text={formatRoster(game.joined_count, game.max_players)} />
          <Row icon="person" text={`Hosted by ${game.host_name}`} />
        </Card>

        {game.notes ? (
          <Card>
            <Muted>{game.notes}</Muted>
          </Card>
        ) : null}

        <View style={{ gap: spacing(2) }}>
          <Subheading>Who's going</Subheading>
          {(roster ?? []).map((entry: RosterEntry) => (
            <Card key={entry.user_id} style={styles.playerRow}>
              <View>
                <Text style={styles.playerName}>
                  {entry.display_name}
                  {entry.user_id === game.host_id ? "  ·  host" : ""}
                </Text>
                {entry.area_label ? <Muted>{entry.area_label}</Muted> : null}
              </View>
              {entry.user_id !== user?.id ? (
                <Ionicons
                  name="ellipsis-horizontal"
                  size={20}
                  color={colors.textMuted}
                  onPress={() => playerActions(entry)}
                />
              ) : null}
            </Card>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isCancelled ? (
          <Muted>This game was cancelled by the host.</Muted>
        ) : amIn ? (
          <>
            <Button
              title="Open chat"
              onPress={() => router.push({ pathname: "/game/chat/[id]", params: { id: activityId } })}
            />
            {isHost ? (
              <Button
                title="Cancel game"
                variant="danger"
                onPress={onCancel}
                loading={cancel.isPending}
              />
            ) : (
              <Button title="Leave game" variant="secondary" onPress={onLeave} loading={leave.isPending} />
            )}
          </>
        ) : isPast ? (
          <Muted>This game has finished.</Muted>
        ) : isFull ? (
          <Button title="Game full" disabled onPress={() => {}} />
        ) : (
          <Button title="Join game" onPress={onJoin} loading={join.isPending} />
        )}
      </View>
    </Screen>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(8) },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2) },
  titleActions: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  countdown: {
    color: colors.ember,
    fontSize: font.small,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: -spacing(2),
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  metaText: { color: colors.text, fontSize: font.body, fontFamily: fonts.body },
  playerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing(3) },
  playerName: { color: colors.text, fontSize: font.body, fontFamily: fonts.bodyBold },
  footer: {
    padding: spacing(5),
    gap: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  badge: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1) },
  badgeFull: { backgroundColor: colors.primary },
  badgeText: { color: colors.ember, fontSize: 11, fontFamily: fonts.monoBold, letterSpacing: 0.5, textTransform: "uppercase" },
  badgeTextFull: { color: colors.primaryText },
});
