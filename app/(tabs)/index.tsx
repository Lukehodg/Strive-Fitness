import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, EmptyState, Heading, Muted, Screen } from "@/components/ui";
import { GameCard } from "@/components/GameCard";
import { GameListSkeleton } from "@/components/Skeleton";
import { colors, radius, spacing } from "@/components/theme";
import { useNearbyActivities } from "@/hooks/useNearbyActivities";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";

export default function DiscoverScreen() {
  const router = useRouter();
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading, isError, refetch, isRefetching } = useNearbyActivities(coords);

  const count = data?.length ?? 0;
  const countLabel =
    !coords || isLoading
      ? "Pickup football near you"
      : count === 0
        ? "No games nearby yet"
        : `${count} game${count === 1 ? "" : "s"} near you`;

  const openGame = (id: string) => router.push({ pathname: "/game/[id]", params: { id } });

  return (
    <Screen>
      <View style={styles.header}>
        <Heading>Discover</Heading>
        <Muted>{countLabel}</Muted>
      </View>

      {!coords || isLoading ? (
        <GameListSkeleton />
      ) : isError ? (
        <View style={{ flex: 1, padding: spacing(6), gap: spacing(4) }}>
          <EmptyState title="Couldn't load games" message="Check your connection and try again." />
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderItem={({ item }) => (
            <GameCard
              game={{
                id: item.id,
                title: item.title,
                venue_label: item.venue_label,
                starts_at: item.starts_at,
                status: item.status,
                max_players: item.max_players,
                joined_count: item.joined_count,
                distance_meters: item.distance_meters,
              }}
              onPress={() => openGame(item.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No games nearby"
              message="Be the first to host one — tap the + to create a game."
            />
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push("/game/create")}>
        <Ionicons name="add" size={28} color={colors.primaryText} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(2),
    paddingBottom: spacing(3),
  },
  list: { padding: spacing(5), gap: spacing(3.5), paddingBottom: spacing(24) },
  fab: {
    position: "absolute",
    right: spacing(5),
    bottom: spacing(6),
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
