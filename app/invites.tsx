import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, EmptyState, Loading, Screen } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useMyInvites, useRespondToInvite, type MyInvite } from "@/hooks/useInvites";
import { useMyProfile } from "@/hooks/useProfile";
import { formatStartTime } from "@/lib/format";

export default function InvitesScreen() {
  const router = useRouter();
  const { data: profile } = useMyProfile();
  const { data, isLoading, refetch, isRefetching } = useMyInvites();
  const respond = useRespondToInvite();

  if (isLoading) return <Loading />;

  const invites = data ?? [];

  async function act(invite: MyInvite, accept: boolean) {
    try {
      await respond.mutateAsync({
        invite,
        accept,
        myName: profile?.display_name ?? "A mate",
      });
      if (accept) {
        router.push({ pathname: "/game/[id]", params: { id: invite.activity_id } });
      }
    } catch (e) {
      Alert.alert("Couldn't respond", e instanceof Error ? e.message : "Try again.");
    }
  }

  if (invites.length === 0) {
    return (
      <Screen edges={["bottom", "left", "right"]}>
        <EmptyState
          icon="mail-open-outline"
          title="No invites"
          message="When a mate invites you to a game, it'll land here."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom", "left", "right"]}>
      <FlatList
        data={invites}
        keyExtractor={(i: MyInvite) => i.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.list}
        renderItem={({ item }: { item: MyInvite }) => {
          const full = item.game_status === "full";
          return (
            <View style={styles.card}>
              <View style={styles.head}>
                <Avatar name={item.inviter_name} url={item.inviter_avatar} size={40} />
                <Text style={styles.inviter} numberOfLines={1}>
                  <Text style={styles.inviterName}>{item.inviter_name}</Text> invited you
                </Text>
              </View>

              <Text style={styles.gameTitle} numberOfLines={1}>
                {item.game_title}
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                <Text style={styles.meta}>{formatStartTime(item.starts_at)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                <Text style={styles.meta} numberOfLines={1}>
                  {item.venue_label}
                </Text>
              </View>

              <View style={styles.actions}>
                <Button
                  title="Decline"
                  variant="secondary"
                  style={styles.actionBtn}
                  onPress={() => act(item, false)}
                />
                <Button
                  title={full ? "Game full" : "Accept"}
                  disabled={full || respond.isPending}
                  style={styles.actionBtn}
                  onPress={() => act(item, true)}
                />
              </View>
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(5), gap: spacing(3.5) },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(2),
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing(2.5), marginBottom: spacing(1) },
  inviter: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 },
  inviterName: { color: colors.text, fontFamily: fonts.bodyBold },
  gameTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.display, letterSpacing: -0.3 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  meta: { flex: 1, color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
  actions: { flexDirection: "row", gap: spacing(3), marginTop: spacing(2) },
  actionBtn: { flex: 1, height: 44 },
});
