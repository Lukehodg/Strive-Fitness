import { useEffect, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, Card, Heading, Loading, Muted, Screen, Subheading } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import {
  statusLabel,
  useActivity,
  useCancelActivity,
  useJoinActivity,
  useKickPlayer,
  useLeaveActivity,
  useRoster,
  type RosterEntry,
} from "@/hooks/useActivity";
import { useUnreadCounts } from "@/hooks/useUnread";
import { useResult, useSaveResult } from "@/hooks/useResults";
import { useAddConnection, useBlockUser, useReportUser } from "@/hooks/useSafety";
import { useJoinWaitlist, useLeaveWaitlist, useWaitlist, type WaitlistEntry } from "@/hooks/useWaitlist";
import { skillLabel } from "@/lib/activity-format";
import { activityNoun, isFootball, sportHasScore, sportIcon, sportLabel } from "@/lib/sports";
import { addGameToCalendar } from "@/lib/calendar";
import { capture } from "@/lib/analytics";
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
  const { data: waitlist } = useWaitlist(activityId);
  const joinWaitlist = useJoinWaitlist(activityId);
  const leaveWaitlist = useLeaveWaitlist(activityId);
  const kick = useKickPlayer(activityId);
  const { data: unreadMap } = useUnreadCounts();
  const { data: result } = useResult(activityId);
  const saveResult = useSaveResult(activityId);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");

  useEffect(() => {
    if (activityId) capture("game_viewed", { activityId });
  }, [activityId]);

  if (isLoading || !game) return <Loading />;

  const amIn = !!roster?.some((r: RosterEntry) => r.user_id === user?.id);
  const isHost = game.host_id === user?.id;
  const isFull = game.status === "full";
  const isCancelled = game.status === "cancelled";
  const isPast = +new Date(game.starts_at) + game.duration_minutes * 60_000 < Date.now();
  const verified = profile?.phone_verified ?? false;
  // Sport-natural noun: "game" / "run" / "ride" / "match" / "session".
  const noun = activityNoun(game.activity_type);
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);

  // Waitlist position (1-based), or null when not queued.
  const waitlistPosition = (() => {
    const i = (waitlist ?? []).findIndex((w: WaitlistEntry) => w.user_id === user?.id);
    return i >= 0 ? i + 1 : null;
  })();

  async function onShare() {
    if (!game) return;
    try {
      await Share.share({
        message:
          `${game.title} — ${game.venue_label}\n${formatStartTime(game.starts_at)}\n` +
          `Join me on Stride: strive://game/${activityId}`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }

  async function onAddToCalendar() {
    if (!game) return;
    try {
      const ok = await addGameToCalendar({
        title: game.title,
        venueLabel: game.venue_label,
        startsAt: game.starts_at,
        durationMinutes: game.duration_minutes,
      });
      Alert.alert(
        ok ? "Added to calendar" : "Calendar",
        ok ? "See you there." : "Couldn't access your calendar — check Stride's permission in Settings.",
      );
    } catch (e) {
      Alert.alert("Calendar", e instanceof Error ? e.message : "Couldn't add the event.");
    }
  }

  function onCancel() {
    Alert.alert(`Cancel this ${noun}?`, "Everyone on the roster will see it's been called off.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel game",
        style: "destructive",
        onPress: async () => {
          try {
            await cancel.mutateAsync(game?.title);
          } catch (e) {
            Alert.alert("Couldn't cancel", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  async function onJoin() {
    if (profile?.suspended_at) {
      Alert.alert(
        "Account suspended",
        "You can browse while suspended, but you can't join. Contact support if you think this is a mistake.",
      );
      return;
    }
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

  async function onJoinWaitlist() {
    if (profile?.suspended_at) {
      Alert.alert("Account suspended", "You can't join a waitlist while suspended.");
      return;
    }
    if (!verified) {
      Alert.alert("Verify first", "Verify your phone number before joining waitlists.", [
        { text: "Not now", style: "cancel" },
        { text: "Verify", onPress: () => router.push("/(auth)/verify-phone") },
      ]);
      return;
    }
    try {
      await joinWaitlist.mutateAsync();
    } catch (e) {
      Alert.alert("Waitlist", e instanceof Error ? e.message : "Try again.");
    }
  }

  async function onLeaveWaitlist() {
    try {
      await leaveWaitlist.mutateAsync();
    } catch (e) {
      Alert.alert("Waitlist", e instanceof Error ? e.message : "Try again.");
    }
  }

  async function onSaveResult() {
    const a = parseInt(scoreA, 10);
    const b = parseInt(scoreB, 10);
    if (Number.isNaN(a) || Number.isNaN(b) || a < 0 || b < 0) {
      Alert.alert("Add the score", "Enter both scores as numbers.");
      return;
    }
    try {
      await saveResult.mutateAsync({ scoreA: a, scoreB: b, gameTitle: game!.title });
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
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
      {
        text: "View profile",
        onPress: () =>
          router.push({ pathname: "/user/[id]", params: { id: entry.user_id } }),
      },
      { text: "Report", style: "destructive", onPress: () => onReport(entry.user_id, entry.display_name) },
      { text: "Block", style: "destructive", onPress: () => onBlock(entry.user_id, entry.display_name) },
    ];
    if (isHost && !isPast && !isCancelled) {
      buttons.splice(1, 0, {
        text: `Remove from ${noun}`,
        style: "destructive",
        onPress: () => {
          Alert.alert(
            `Remove ${entry.display_name}?`,
            "They'll be taken off the roster (they can rejoin unless you block them). If anyone's waitlisted, the next in line takes the spot.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: async () => {
                  try {
                    await kick.mutateAsync({ userId: entry.user_id, gameTitle: game!.title });
                  } catch (e) {
                    Alert.alert("Couldn't remove", e instanceof Error ? e.message : "Try again.");
                  }
                },
              },
            ],
          );
        },
      });
    }
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
            {!isPast && !isCancelled ? (
              <Ionicons
                name="calendar-outline"
                size={22}
                color={colors.textMuted}
                onPress={onAddToCalendar}
              />
            ) : null}
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
          <Row
            icon={sportIcon(game.activity_type)}
            text={
              isFootball(game.activity_type)
                ? `${game.format}  ·  ${skillLabel(game.skill_level)}`
                : sportLabel(game.activity_type)
            }
          />
          <Row icon="time" text={formatStartTime(game.starts_at)} />
          <Row icon="hourglass" text={`${game.duration_minutes} min`} />
          <Row icon="location" text={game.venue_label} />
          <Row icon="people" text={formatRoster(game.joined_count, game.max_players)} />
          <Row icon="person" text={`Hosted by ${game.host_name}`} />
        </Card>

        {result ? (
          <Card style={styles.resultCard}>
            <Text style={styles.resultEyebrow}>FULL TIME</Text>
            <Text style={styles.resultScore}>
              {result.score_a} — {result.score_b}
            </Text>
            {result.note ? <Muted>{result.note}</Muted> : null}
          </Card>
        ) : isPast && isHost && sportHasScore(game.activity_type) ? (
          <Card style={{ gap: spacing(3) }}>
            <Text style={styles.resultEyebrow}>RECORD THE RESULT</Text>
            <View style={styles.scoreRow}>
              <TextInput
                style={styles.scoreInput}
                value={scoreA}
                onChangeText={setScoreA}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                maxLength={3}
              />
              <Text style={styles.scoreDash}>—</Text>
              <TextInput
                style={styles.scoreInput}
                value={scoreB}
                onChangeText={setScoreB}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                maxLength={3}
              />
            </View>
            <Button
              title="Save result"
              onPress={onSaveResult}
              loading={saveResult.isPending}
              style={{ height: 44 }}
            />
          </Card>
        ) : null}

        {game.notes ? (
          <Card>
            <Muted>{game.notes}</Muted>
          </Card>
        ) : null}

        {amIn && !isPast && !isCancelled ? (
          <Button
            title="Invite a connection"
            variant="secondary"
            onPress={() => router.push({ pathname: "/game/invite/[id]", params: { id: activityId } })}
          />
        ) : null}

        <View style={{ gap: spacing(2) }}>
          <Subheading>Who&apos;s going</Subheading>
          {(roster ?? []).map((entry: RosterEntry) => (
            <Card key={entry.user_id} style={styles.playerRow}>
              <View style={styles.playerInfo}>
                <Avatar name={entry.display_name} url={entry.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.playerNameRow}>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {entry.display_name}
                    </Text>
                    {entry.user_id === game.host_id ? (
                      <View style={styles.hostTag}>
                        <Text style={styles.hostTagText}>HOST</Text>
                      </View>
                    ) : null}
                  </View>
                  {entry.area_label ? <Muted>{entry.area_label}</Muted> : null}
                </View>
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
          <Muted>This {noun} was cancelled by the host.</Muted>
        ) : amIn ? (
          <>
            <Button
              title={
                unreadMap?.[activityId]
                  ? `Open chat (${unreadMap[activityId]} new)`
                  : "Open chat"
              }
              onPress={() => router.push({ pathname: "/game/chat/[id]", params: { id: activityId } })}
            />
            {isHost && !isPast ? (
              <Button
                title="Edit details"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: "/game/edit/[id]", params: { id: activityId } })
                }
              />
            ) : null}
            {isHost ? (
              <Button
                title={`Cancel ${noun}`}
                variant="danger"
                onPress={onCancel}
                loading={cancel.isPending}
              />
            ) : (
              <Button title={`Leave ${noun}`} variant="secondary" onPress={onLeave} loading={leave.isPending} />
            )}
          </>
        ) : isPast ? (
          <Muted>This {noun} has finished.</Muted>
        ) : isFull ? (
          waitlistPosition ? (
            <>
              <Muted>
                You&apos;re #{waitlistPosition} on the waitlist — if a spot opens, you&apos;re
                added automatically and we&apos;ll ping you.
              </Muted>
              <Button
                title="Leave waitlist"
                variant="secondary"
                onPress={onLeaveWaitlist}
                loading={leaveWaitlist.isPending}
              />
            </>
          ) : (
            <>
              <Muted>
                {Noun} full
                {waitlist?.length ? ` · ${waitlist.length} waiting` : ""} — join the
                waitlist and you&apos;ll be added if a spot opens.
              </Muted>
              <Button
                title="Join waitlist"
                onPress={onJoinWaitlist}
                loading={joinWaitlist.isPending}
              />
            </>
          )
        ) : (
          <Button title={`Join ${noun}`} onPress={onJoin} loading={join.isPending} />
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
  playerInfo: { flexDirection: "row", alignItems: "center", gap: spacing(3), flex: 1 },
  playerNameRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  playerName: { color: colors.text, fontSize: font.body, fontFamily: fonts.bodyBold },
  hostTag: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing(1.5), paddingVertical: 2 },
  hostTagText: { color: colors.ember, fontFamily: fonts.monoBold, fontSize: 9, letterSpacing: 0.5 },
  footer: {
    padding: spacing(5),
    gap: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  resultCard: { alignItems: "center", gap: spacing(1) },
  resultEyebrow: {
    color: colors.ember,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  resultScore: {
    color: colors.text,
    fontFamily: fonts.displayBlack,
    fontSize: 40,
    letterSpacing: -1,
  },
  scoreRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(3) },
  scoreDash: { color: colors.textMuted, fontFamily: fonts.display, fontSize: 22 },
  scoreInput: {
    width: 72,
    height: 56,
    textAlign: "center",
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.displayBlack,
    fontSize: 26,
  },
  badge: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1) },
  badgeFull: { backgroundColor: colors.primary },
  badgeText: { color: colors.ember, fontSize: 11, fontFamily: fonts.monoBold, letterSpacing: 0.5, textTransform: "uppercase" },
  badgeTextFull: { color: colors.primaryText },
});
