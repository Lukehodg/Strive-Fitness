import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";

import { Button, EmptyState, Heading, Loading, Muted, Screen } from "@/components/ui";
import { GameCard } from "@/components/GameCard";
import { colors, font, radius, spacing } from "@/components/theme";
import { useNearbyActivities } from "@/hooks/useNearbyActivities";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";
import type { NearbyActivity } from "@/types/database";

type ViewMode = "list" | "map";

export default function DiscoverScreen() {
  const router = useRouter();
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mode, setMode] = useState<ViewMode>("list");

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading, isError, refetch, isRefetching } = useNearbyActivities(coords);

  const openGame = (id: string) => router.push({ pathname: "/game/[id]", params: { id } });

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Heading>Discover</Heading>
          <Muted>Pickup football near you</Muted>
        </View>
        <View style={styles.toggle}>
          <Segment label="List" active={mode === "list"} onPress={() => setMode("list")} />
          <Segment label="Map" active={mode === "map"} onPress={() => setMode("map")} />
        </View>
      </View>

      {!coords || isLoading ? (
        <Loading />
      ) : isError ? (
        <View style={{ flex: 1, padding: spacing(6), gap: spacing(4) }}>
          <EmptyState title="Couldn't load games" message="Check your connection and try again." />
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      ) : mode === "map" ? (
        <MapView
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: coords.latitude,
            longitude: coords.longitude,
            latitudeDelta: 0.2,
            longitudeDelta: 0.2,
          }}
          showsUserLocation
        >
          {(data ?? []).map((g: NearbyActivity) => (
            // We don't expose exact coords to the client, so markers sit on the
            // user's region; map mode is a coarse overview. Tapping opens detail.
            <Marker
              key={g.id}
              coordinate={{ latitude: coords.latitude, longitude: coords.longitude }}
              title={g.title}
              description={g.venue_label}
              onCalloutPress={() => openGame(g.id)}
            />
          ))}
        </MapView>
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

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segment, active && styles.segmentActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(2),
    paddingBottom: spacing(3),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  toggle: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3 },
  segment: { paddingHorizontal: spacing(3.5), paddingVertical: spacing(1.5), borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  segmentTextActive: { color: colors.primaryText },
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
