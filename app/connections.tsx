import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState, Loading, Muted, Screen } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, fonts, radius, spacing } from "@/components/theme";
import {
  useConnections,
  useRemoveConnection,
  type Connection,
} from "@/hooks/useConnections";
import { useConnectionsLeaderboard } from "@/hooks/useStats";
import { useAuth } from "@/hooks/useAuth";
import type { LeaderboardRow } from "@/types/database";

/**
 * People you've added via "play again" — plus the competitive bit: a this-month
 * leaderboard across your circle. Tap anyone to see their profile and stats.
 */
export default function ConnectionsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useConnections();
  const leaderboard = useConnectionsLeaderboard();
  const remove = useRemoveConnection();

  if (isLoading) return <Loading />;

  const connections = data ?? [];
  const board = (leaderboard.data ?? []).slice(0, 5);
  // A leaderboard of one (just you) isn't a competition — hide until there's a rival.
  const showBoard = board.length > 1;

  function openProfile(id: string) {
    router.push({ pathname: "/user/[id]", params: { id } });
  }

  function onRemove(c: Connection) {
    Alert.alert("Remove connection?", `${c.display_name} will be removed from your connections.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await remove.mutateAsync(c.id);
          } catch (e) {
            Alert.alert("Couldn't remove", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  }

  if (connections.length === 0) {
    return (
      <Screen edges={["bottom", "left", "right"]}>
        <EmptyState
          icon="people-outline"
          title="No connections yet"
          message="After a game, tap a player and choose “Play again” to add them here — they'll be ready for your next kickabout."
        />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom", "left", "right"]}>
      <FlatList
        data={connections}
        keyExtractor={(c: Connection) => c.id}
        onRefresh={() => {
          refetch();
          leaderboard.refetch();
        }}
        refreshing={isRefetching}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing(3) }}>
            {showBoard ? (
              <View style={styles.board}>
                <Text style={styles.boardTitle}>THIS MONTH</Text>
                {board.map((row: LeaderboardRow, i: number) => {
                  const me = row.user_id === user?.id;
                  return (
                    <Pressable
                      key={row.user_id}
                      style={styles.boardRow}
                      onPress={() => (me ? undefined : openProfile(row.user_id))}
                    >
                      <Text style={[styles.rank, i === 0 && styles.rankFirst]}>{i + 1}</Text>
                      <Avatar name={row.display_name} url={row.avatar_url} size={30} />
                      <Text style={[styles.boardName, me && styles.boardNameMe]} numberOfLines={1}>
                        {me ? "You" : row.display_name}
                      </Text>
                      <Text style={styles.boardCount}>
                        {row.games_this_month} {row.games_this_month === 1 ? "game" : "games"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            <Muted>
              {connections.length} {connections.length === 1 ? "person" : "people"} you've played
              with.
            </Muted>
          </View>
        }
        renderItem={({ item }: { item: Connection }) => (
          <Pressable
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.9 : 1 }]}
            onPress={() => openProfile(item.id)}
          >
            <Avatar name={item.display_name} url={item.avatar_url} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.display_name}
              </Text>
              {item.area_label ? <Text style={styles.area}>{item.area_label}</Text> : null}
            </View>
            <Ionicons
              name="close-circle-outline"
              size={24}
              color={colors.textMuted}
              onPress={() => onRemove(item)}
            />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(5), gap: spacing(3) },
  board: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3.5),
    gap: spacing(2.5),
  },
  boardTitle: {
    color: colors.ember,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  boardRow: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  rank: {
    width: 18,
    textAlign: "center",
    color: colors.textMuted,
    fontFamily: fonts.monoBold,
    fontSize: 12,
  },
  rankFirst: { color: colors.primary },
  boardName: { flex: 1, color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  boardNameMe: { color: colors.ember },
  boardCount: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.3 },
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
});
