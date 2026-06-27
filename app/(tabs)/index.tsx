import { useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, EmptyState, Heading, Screen } from "@/components/ui";
import { GameCard } from "@/components/GameCard";
import { GameListSkeleton } from "@/components/Skeleton";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useNearbyActivities } from "@/hooks/useNearbyActivities";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";
import type { GameFormat, NearbyActivity } from "@/types/database";

const RADII_KM = [5, 10, 25, 50];
const FORMAT_FILTERS: { value: GameFormat | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "5-a-side", label: "5-a-side" },
  { value: "7-a-side", label: "7-a-side" },
  { value: "11-a-side", label: "11-a-side" },
  { value: "kickabout", label: "Kickabout" },
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [formatFilter, setFormatFilter] = useState<GameFormat | "all">("all");

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading, isError, refetch, isRefetching } = useNearbyActivities(
    coords,
    radiusKm * 1000,
  );

  const games =
    formatFilter === "all"
      ? (data ?? [])
      : (data ?? []).filter((g: NearbyActivity) => g.format === formatFilter);

  const count = games.length;
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
        <Text style={styles.count}>{countLabel}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filters}
      >
        {RADII_KM.map((km) => {
          const active = km === radiusKm;
          return (
            <Pressable
              key={km}
              onPress={() => setRadiusKm(km)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{km} KM</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filters}
      >
        {FORMAT_FILTERS.map((f) => {
          const active = f.value === formatFilter;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFormatFilter(f.value)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!coords || isLoading ? (
        <GameListSkeleton />
      ) : isError ? (
        <View style={{ flex: 1, padding: spacing(6), gap: spacing(4) }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load games"
            message="Check your connection and try again."
          />
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={games}
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
                format: item.format,
                joined_count: item.joined_count,
                distance_meters: item.distance_meters,
              }}
              onPress={() => openGame(item.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="football-outline"
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
    paddingBottom: spacing(2.5),
    gap: spacing(1),
  },
  count: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  // flexGrow:0 keeps the row at its natural height; alignItems centres the
  // chips so they don't stretch to fill vertical space.
  filterBar: { flexGrow: 0, marginBottom: spacing(3) },
  filters: { paddingHorizontal: spacing(5), gap: spacing(2), alignItems: "center" },
  chip: {
    height: 38,
    justifyContent: "center",
    paddingHorizontal: spacing(4),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipTextActive: { color: colors.primaryText },
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
