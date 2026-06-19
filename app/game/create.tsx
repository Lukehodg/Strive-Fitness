import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MapView, { Marker, type MapPressEvent } from "react-native-maps";

import { Button, Field, Muted, Screen, Subheading } from "@/components/ui";
import { colors, font, radius, spacing } from "@/components/theme";
import { useMyProfile } from "@/hooks/useProfile";
import { useCreateActivity } from "@/hooks/useActivity";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";

/** Build a Date n days from today at the given HH:MM. */
function dateFrom(dayOffset: number, time: string): Date | null {
  const parts = time.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

const DAY_LABELS = ["Today", "Tomorrow", "+2d", "+3d", "+4d", "+5d", "+6d"];

export default function CreateGameScreen() {
  const router = useRouter();
  const { data: profile } = useMyProfile();
  const create = useCreateActivity();

  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("10");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState("18:30");
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  if (!profile?.phone_verified) {
    return (
      <Screen>
        <View style={styles.gate}>
          <Subheading>Verify to host</Subheading>
          <Muted>You need a verified phone number before you can host a game.</Muted>
          <Button title="Verify phone" onPress={() => router.push("/(auth)/verify-phone")} />
        </View>
      </Screen>
    );
  }

  async function onCreate() {
    const startsAt = dateFrom(dayOffset, time);
    const max = parseInt(maxPlayers, 10);
    const dur = parseInt(duration, 10);

    if (title.trim().length < 3) return Alert.alert("Add a title", "Give your game a name.");
    if (venue.trim().length < 2) return Alert.alert("Add a venue", "Where is it?");
    if (!coords) return Alert.alert("Pick a location", "Tap the map to set where it is.");
    if (!startsAt || startsAt.getTime() < Date.now())
      return Alert.alert("Check the time", "Pick a start time in the future (HH:MM).");
    if (Number.isNaN(max) || max < 2) return Alert.alert("Max players", "Enter at least 2.");
    if (Number.isNaN(dur) || dur < 15) return Alert.alert("Duration", "Enter minutes (15+).");

    try {
      const game = await create.mutateAsync({
        title: title.trim(),
        venue_label: venue.trim(),
        location: coords,
        starts_at: startsAt.toISOString(),
        duration_minutes: dur,
        max_players: max,
        notes: notes.trim() || undefined,
      });
      router.replace({ pathname: "/game/[id]", params: { id: game.id } });
    } catch (e) {
      Alert.alert("Couldn't create", e instanceof Error ? e.message : "Try again.");
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="Sunday 5-a-side" />
        <Field label="Venue" value={venue} onChangeText={setVenue} placeholder="Weybridge Sports Hub" />

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.label}>Location — tap the map</Text>
          <View style={styles.mapWrap}>
            {coords ? (
              <MapView
                style={StyleSheet.absoluteFillObject}
                initialRegion={{
                  latitude: coords.latitude,
                  longitude: coords.longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                onPress={(e: MapPressEvent) => setCoords(e.nativeEvent.coordinate)}
              >
                <Marker coordinate={coords} />
              </MapView>
            ) : null}
          </View>
        </View>

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.label}>Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
            {DAY_LABELS.map((label, i) => (
              <Pressable
                key={label}
                onPress={() => setDayOffset(i)}
                style={[styles.chip, dayOffset === i && styles.chipActive]}
              >
                <Text style={[styles.chipText, dayOffset === i && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Field label="Start time (HH:MM)" value={time} onChangeText={setTime} placeholder="18:30" keyboardType="numbers-and-punctuation" />

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Max players" value={maxPlayers} onChangeText={setMaxPlayers} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Duration (min)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
          </View>
        </View>

        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Bring a dark & light shirt." multiline />

        <Button title="Create game" onPress={onCreate} loading={create.isPending} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(10) },
  gate: { flex: 1, justifyContent: "center", padding: spacing(8), gap: spacing(3) },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  mapWrap: { height: 200, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  twoCol: { flexDirection: "row", gap: spacing(3) },
  chip: { paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontWeight: "700", fontSize: font.small },
  chipTextActive: { color: colors.primaryText },
});
