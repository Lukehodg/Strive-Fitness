import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Button, Field, Loading, Muted, Screen, Subheading } from "@/components/ui";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import {
  useActivity,
  useUpdateActivity,
  type ActivityDetail,
} from "@/hooks/useActivity";
import { dateFromDayOffset, formatDayChip } from "@/lib/format";

const DAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6];

export default function EditGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data: game, isLoading } = useActivity(id!);

  if (isLoading || !game) return <Loading />;

  if (game.host_id !== user?.id) {
    return (
      <Screen>
        <View style={styles.gate}>
          <Subheading>Host only</Subheading>
          <Muted>Only the host can edit this game.</Muted>
        </View>
      </Screen>
    );
  }

  return <EditForm game={game} />;
}

/** Separate component so state initialisers can read the loaded game once. */
function EditForm({ game }: { game: ActivityDetail }) {
  const router = useRouter();
  const update = useUpdateActivity(game.id);

  const start = new Date(game.starts_at);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const originalOffset = Math.round(
    (startOfDay(start).getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
  );

  const [title, setTitle] = useState(game.title);
  const [venue, setVenue] = useState(game.venue_label);
  const [maxPlayers, setMaxPlayers] = useState(String(game.max_players));
  const [duration, setDuration] = useState(String(game.duration_minutes));
  const [notes, setNotes] = useState(game.notes ?? "");
  const [dayOffset, setDayOffset] = useState(Math.min(Math.max(originalOffset, 0), 6));
  const [time, setTime] = useState(
    `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
  );
  // Only rebuild starts_at if the host actually touched the schedule —
  // otherwise the original kickoff (even outside the 7-day chips) is kept.
  const [timeDirty, setTimeDirty] = useState(false);

  async function onSave() {
    const max = parseInt(maxPlayers, 10);
    const dur = parseInt(duration, 10);

    if (title.trim().length < 3) return Alert.alert("Title", "Give the game a name.");
    if (venue.trim().length < 2) return Alert.alert("Venue", "Where is it?");
    if (Number.isNaN(max) || max < 2) return Alert.alert("Max players", "Enter at least 2.");
    if (Number.isNaN(dur) || dur < 15) return Alert.alert("Duration", "Enter minutes (15+).");

    let startsAt = game.starts_at;
    if (timeDirty) {
      const next = dateFromDayOffset(dayOffset, time);
      if (!next || next.getTime() < Date.now()) {
        return Alert.alert("Check the time", "Pick a start time in the future (HH:MM).");
      }
      startsAt = next.toISOString();
    }

    try {
      await update.mutateAsync({
        title: title.trim(),
        venue_label: venue.trim(),
        starts_at: startsAt,
        duration_minutes: dur,
        max_players: max,
        notes: notes.trim() || null,
      });
      Alert.alert("Updated", "The roster's been told.");
      router.back();
    } catch (e) {
      Alert.alert("Couldn't update", e instanceof Error ? e.message : "Try again.");
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={title} onChangeText={setTitle} />
        <Field label="Venue" value={venue} onChangeText={setVenue} />
        <Muted>
          The map pin stays where it was — for a different location, cancel this and
          create a new one.
        </Muted>

        <View style={{ gap: spacing(2) }}>
          <Text style={styles.label}>Day</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing(2) }}
          >
            {DAY_OFFSETS.map((i) => (
              <Pressable
                key={i}
                onPress={() => {
                  setDayOffset(i);
                  setTimeDirty(true);
                }}
                style={[styles.chip, dayOffset === i && timeDirty && styles.chipActive]}
              >
                <Text style={[styles.chipText, dayOffset === i && timeDirty && styles.chipTextActive]}>
                  {formatDayChip(i)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {!timeDirty ? (
            <Muted>Currently {new Date(game.starts_at).toLocaleString()} — tap a day or edit the time to reschedule.</Muted>
          ) : null}
        </View>

        <Field
          label="Start time (HH:MM)"
          value={time}
          onChangeText={(t: string) => {
            setTime(t);
            setTimeDirty(true);
          }}
          keyboardType="numbers-and-punctuation"
        />

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Field label="Max players" value={maxPlayers} onChangeText={setMaxPlayers} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Duration (min)" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
          </View>
        </View>
        <Muted>Raising max players lets the waitlist in automatically.</Muted>

        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

        <Button title="Save changes" onPress={onSave} loading={update.isPending} />
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
  twoCol: { flexDirection: "row", gap: spacing(3) },
  chip: {
    height: 40,
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
    fontFamily: fonts.monoBold,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  chipTextActive: { color: colors.primaryText },
});
