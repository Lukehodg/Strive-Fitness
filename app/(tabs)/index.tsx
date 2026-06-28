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
import { SPORTS, SPORT_META, sportIcon, sportLabel } from "@/lib/sports";
import type { ActivityType, NearbyActivity } from "@/types/database";

const RADII_KM = [5, 10, 25, 50];
const SPORT_FILTERS: { value: ActivityType | "all"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "all", label: "All", icon: "apps" },
  ...SPORTS.map((s) => ({ value: s, label: SPORT_META[s].label, icon: SPORT_META[s].icon })),
];

export default function DiscoverScreen() {
  const router = useRouter();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [sportFilter, setSportFilter] = useState<ActivityType | "all">("all");

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading, isError, refetch, isRefetching } = useNearbyActivities(
    coords,
    radiusKm * 1000,
  );

  const games =
    sportFilter === "all"
      ? (data ?? [])
      : (data ?? []).filter((g: NearbyActivity) => g.activity_type === sportFilter);

  const count = games.length;
  const countLabel =
    !coords || isLoading
      ? "Activities near you"
      : count === 0
        ? "Nothing nearby yet"
        : `${count} ${count === 1 ? "activity" : "activities"} near you`;

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
        {SPORT_FILTERS.map((f) => {
          const active = f.value === sportFilter;
          return (
            <Pressable
              key={f.value}
              onPress={() => setSportFilter(f.value)}
              style={[styles.chip, styles.chipRow, active && styles.chipActive]}
            >
              <Ionicons
                name={f.icon}
                size={14}
                color={active ? colors.primaryText : colors.textMuted}
              />
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
                activity_type: item.activity_type,
                format: item.format,
                joined_count: item.joined_count,
                distance_meters: item.distance_meters,
              }}
              onPress={() => openGame(item.id)}
            />
          )}
          ListEmptyComponent={
            sportFilter === "all" ? (
              <EmptyState
                icon="search-outline"
                title="Nothing nearby"
                message="Be the first to host one — tap the + to create an activity."
              />
            ) : (
              <EmptyState
                icon={sportIcon(sportFilter)}
                title={`No ${sportLabel(sportFilter).toLowerCase()} nearby`}
                message={`Nothing within ${radiusKm} km. Widen the radius, or tap the + to host the first one.`}
              />
            )
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() =>
          router.push(
            sportFilter === "all"
              ? "/game/create"
              : { pathname: "/game/create", params: { sport: sportFilter } },
          )
        }
      >
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
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
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
