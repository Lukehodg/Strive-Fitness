import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import MapView, { Marker, type MapPressEvent } from "react-native-maps";

import { Button, Field, Muted, Screen, Subheading } from "@/components/ui";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useMyProfile } from "@/hooks/useProfile";
import { useCreateActivity } from "@/hooks/useActivity";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";
import type { GameFormat, SkillLevel } from "@/types/database";

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
const REPEAT_OPTIONS = [
  { weeks: 1, label: "Just once" },
  { weeks: 4, label: "× 4 weeks" },
  { weeks: 8, label: "× 8 weeks" },
];
const FORMATS: { value: GameFormat; label: string }[] = [
  { value: "kickabout", label: "Kickabout" },
  { value: "5-a-side", label: "5-a-side" },
  { value: "7-a-side", label: "7-a-side" },
  { value: "11-a-side", label: "11-a-side" },
];
const SKILLS: { value: SkillLevel; label: string }[] = [
  { value: "all", label: "All welcome" },
  { value: "casual", label: "Casual" },
  { value: "competitive", label: "Competitive" },
];

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
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [format, setFormat] = useState<GameFormat>("kickabout");
  const [skill, setSkill] = useState<SkillLevel>("all");
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
        format,
        skill_level: skill,
        notes: notes.trim() || undefined,
        repeat_weeks: repeatWeeks,
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
          <Text style={styles.label}>Format</Text>
          <View style={styles.repeatRow}>
            {FORMATS.map((f) => (
              <Pressable
                key={f.value}
                onPress={() => setFormat(f.value)}
                style={[styles.chip, format === f.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, format === f.value && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.label}>Skill level</Text>
          <View style={styles.repeatRow}>
            {SKILLS.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setSkill(s.value)}
                style={[styles.chip, skill === s.value && styles.chipActive]}
              >
                <Text style={[styles.chipText, skill === s.value && styles.chipTextActive]}>
                  {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

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

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.label}>Repeat</Text>
          <View style={styles.repeatRow}>
            {REPEAT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.weeks}
                onPress={() => setRepeatWeeks(opt.weeks)}
                style={[styles.chip, repeatWeeks === opt.weeks && styles.chipActive]}
              >
                <Text style={[styles.chipText, repeatWeeks === opt.weeks && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {repeatWeeks > 1 ? (
            <Muted>Creates {repeatWeeks} weekly games, same day & time.</Muted>
          ) : null}
        </View>

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
  label: {
    color: colors.textMuted,
    fontSize: font.small,
    fontFamily: fonts.mono,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  mapWrap: { height: 200, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  twoCol: { flexDirection: "row", gap: spacing(3) },
  repeatRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
  chip: { height: 40, justifyContent: "center", paddingHorizontal: spacing(4), borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontFamily: fonts.monoBold, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
  chipTextActive: { color: colors.primaryText },
});
