import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { GameCard } from "@/components/GameCard";
import { Loading } from "@/components/ui";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useNearbyActivities } from "@/hooks/useNearbyActivities";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";
import { SPORTS, SPORT_META, sportColor } from "@/lib/sports";
import type { ActivityType, NearbyActivity } from "@/types/database";

const SPORT_FILTERS: { value: ActivityType | "all"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "all", label: "All", icon: "apps" },
  ...SPORTS.map((s) => ({ value: s, label: SPORT_META[s].label, icon: SPORT_META[s].icon })),
];

/**
 * Full-screen map of nearby activities. Markers sit on each one's venue,
 * coloured by sport; tapping one focuses it and shows a preview card. The list
 * lives on the Discover tab — this is the spatial view of the same data.
 */
export default function NearbyScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<ActivityType | "all">("all");

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading } = useNearbyActivities(coords);
  const allGames: NearbyActivity[] = data ?? [];
  const games =
    sportFilter === "all"
      ? allGames
      : allGames.filter((g: NearbyActivity) => g.activity_type === sportFilter);
  const selected = games.find((g: NearbyActivity) => g.id === selectedId) ?? null;

  if (!coords) return <Loading />;

  function focus(game: NearbyActivity) {
    setSelectedId(game.id);
    mapRef.current?.animateToRegion(
      {
        latitude: game.venue_lat,
        longitude: game.venue_lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      350,
    );
  }

  function recentre() {
    if (!coords) return;
    setSelectedId(null);
    mapRef.current?.animateToRegion(
      { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.2, longitudeDelta: 0.2 },
      350,
    );
  }

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
        showsUserLocation
        onPress={() => setSelectedId(null)}
      >
        {games.map((g: NearbyActivity) => (
          <Marker
            key={g.id}
            coordinate={{ latitude: g.venue_lat, longitude: g.venue_lng }}
            pinColor={g.id === selectedId ? colors.primary : sportColor(g.activity_type)}
            onPress={() => focus(g)}
          />
        ))}
      </MapView>

      <SafeAreaView edges={["top"]} style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.headerPill}>
          <Text style={styles.title}>Nearby</Text>
          <Text style={styles.count}>
            {isLoading
              ? "Finding activities…"
              : `${games.length} ${games.length === 1 ? "activity" : "activities"}`}
          </Text>
        </View>

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
                onPress={() => {
                  setSportFilter(f.value);
                  setSelectedId(null);
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={f.icon}
                  size={13}
                  color={active ? colors.primaryText : f.value === "all" ? colors.textMuted : sportColor(f.value)}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <Pressable style={[styles.recentre, selected ? styles.recentreUp : null]} onPress={recentre}>
        <Ionicons name="locate" size={22} color={colors.text} />
      </Pressable>

      {selected ? (
        <View style={styles.bottom} pointerEvents="box-none">
          <GameCard
            game={{
              id: selected.id,
              title: selected.title,
              venue_label: selected.venue_label,
              starts_at: selected.starts_at,
              status: selected.status,
              max_players: selected.max_players,
              activity_type: selected.activity_type,
              format: selected.format,
              joined_count: selected.joined_count,
              distance_meters: selected.distance_meters,
            }}
            onPress={() =>
              router.push({ pathname: "/game/[id]", params: { id: selected.id } })
            }
          />
        </View>
      ) : !isLoading && games.length > 0 ? (
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hint}>Tap a pin to see it</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  headerPill: {
    marginTop: spacing(2),
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(2),
    alignItems: "center",
  },
  title: { color: colors.text, fontSize: font.h3, fontFamily: fonts.display, letterSpacing: -0.3 },
  count: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  filterBar: { width: "100%", flexGrow: 0, maxHeight: 40, marginTop: spacing(2) },
  filters: { paddingHorizontal: spacing(4), gap: spacing(2), alignItems: "center" },
  chip: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    justifyContent: "center",
    paddingHorizontal: spacing(3.5),
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: fonts.monoBold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipTextActive: { color: colors.primaryText },
  recentre: {
    position: "absolute",
    right: spacing(5),
    bottom: spacing(6),
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  recentreUp: { bottom: spacing(40) },
  bottom: { position: "absolute", left: 0, right: 0, bottom: spacing(4), padding: spacing(4) },
  hintWrap: { position: "absolute", left: 0, right: 0, bottom: spacing(6), alignItems: "center" },
  hint: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    backgroundColor: colors.surface,
    overflow: "hidden",
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(1.5),
    borderWidth: 1,
    borderColor: colors.border,
  },
});
