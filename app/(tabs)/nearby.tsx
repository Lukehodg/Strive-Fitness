import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import { GameCard } from "@/components/GameCard";
import { Loading } from "@/components/ui";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useNearbyActivities } from "@/hooks/useNearbyActivities";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";
import type { NearbyActivity } from "@/types/database";

/**
 * Full-screen map of nearby football games. Markers sit on each game's venue;
 * tapping one focuses it and shows a preview card you can open. The list lives
 * on the Discover tab — this is the spatial view of the same data.
 */
export default function NearbyScreen() {
  const router = useRouter();
  const mapRef = useRef<MapView>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading } = useNearbyActivities(coords);
  const games: NearbyActivity[] = data ?? [];
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
            pinColor={g.id === selectedId ? colors.primary : colors.danger}
            onPress={() => focus(g)}
          />
        ))}
      </MapView>

      <SafeAreaView edges={["top"]} style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.headerPill}>
          <Text style={styles.title}>Nearby</Text>
          <Text style={styles.count}>
            {isLoading
              ? "Finding games…"
              : `${games.length} game${games.length === 1 ? "" : "s"}`}
          </Text>
        </View>
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
          <Text style={styles.hint}>Tap a pin to see the game</Text>
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
