import { Alert, FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EmptyState, Loading, Muted, Screen } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, fonts, radius, spacing } from "@/components/theme";
import {
  useConnections,
  useRemoveConnection,
  type Connection,
} from "@/hooks/useConnections";

/**
 * People you've added via "play again" after a game. The persistent thread of
 * the core loop — connections outlast any single game so you can rally the same
 * lads again. Inviting them straight into a game pairs with notifications, so
 * that lands in the next pass.
 */
export default function ConnectionsScreen() {
  const { data, isLoading, refetch, isRefetching } = useConnections();
  const remove = useRemoveConnection();

  if (isLoading) return <Loading />;

  const connections = data ?? [];

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
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Muted>
            {connections.length} {connections.length === 1 ? "person" : "people"} you've played with.
          </Muted>
        }
        renderItem={({ item }: { item: Connection }) => (
          <View style={styles.row}>
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
          </View>
        )}
      />
    </Screen>
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
});
