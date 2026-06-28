import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  HKAuthorizationRequestStatus,
  HKQuantityTypeIdentifier,
  HKWorkoutActivityType,
  HKWorkoutTypeIdentifier,
  queryWorkoutSamples,
  useHealthkitAuthorization,
  type HKWorkout,
} from "@kingstinct/react-native-healthkit";

import { Subheading } from "@/components/ui";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { formatHealthDistance, formatHealthDuration, formatHealthEnergy } from "@/lib/health";

type IconName = keyof typeof Ionicons.glyphMap;

// Read-only: workouts + the distance/energy that hang off them. We never
// request write access, and we never store any of this server-side.
const READ_PERMISSIONS = [
  HKWorkoutTypeIdentifier,
  HKQuantityTypeIdentifier.distanceWalkingRunning,
  HKQuantityTypeIdentifier.distanceCycling,
  HKQuantityTypeIdentifier.activeEnergyBurned,
] as const;

function workoutMeta(type: HKWorkoutActivityType): { label: string; icon: IconName } {
  switch (type) {
    case HKWorkoutActivityType.running:
      return { label: "Run", icon: "walk" };
    case HKWorkoutActivityType.cycling:
      return { label: "Ride", icon: "bicycle" };
    case HKWorkoutActivityType.walking:
      return { label: "Walk", icon: "walk" };
    case HKWorkoutActivityType.hiking:
      return { label: "Hike", icon: "trail-sign" };
    case HKWorkoutActivityType.swimming:
      return { label: "Swim", icon: "water" };
    case HKWorkoutActivityType.traditionalStrengthTraining:
    case HKWorkoutActivityType.functionalStrengthTraining:
      return { label: "Strength", icon: "barbell" };
    case HKWorkoutActivityType.coreTraining:
    case HKWorkoutActivityType.highIntensityIntervalTraining:
      return { label: "Training", icon: "flame" };
    case HKWorkoutActivityType.yoga:
      return { label: "Yoga", icon: "body" };
    case HKWorkoutActivityType.soccer:
      return { label: "Football", icon: "football" };
    case HKWorkoutActivityType.tennis:
      return { label: "Tennis", icon: "tennisball" };
    case HKWorkoutActivityType.basketball:
      return { label: "Basketball", icon: "basketball" };
    default:
      return { label: "Workout", icon: "fitness" };
  }
}

/** "Recent activity" from Apple Health — iOS only, read live, never stored. */
export function HealthSection() {
  const [status, requestAuth] = useHealthkitAuthorization(READ_PERMISSIONS);
  const [workouts, setWorkouts] = useState<readonly HKWorkout[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const w = await queryWorkoutSamples({ limit: 10, ascending: false });
      setWorkouts(w);
    } catch {
      setWorkouts([]);
    } finally {
      setBusy(false);
    }
  }, []);

  // If access has already been decided, load straight away.
  useEffect(() => {
    if (status === HKAuthorizationRequestStatus.unnecessary) load();
  }, [status, load]);

  const connect = useCallback(async () => {
    try {
      setBusy(true);
      await requestAuth();
      await load();
    } catch (e) {
      Alert.alert("Apple Health", e instanceof Error ? e.message : "Couldn't connect.");
    } finally {
      setBusy(false);
    }
  }, [requestAuth, load]);

  const loaded = workouts !== null;

  return (
    <View style={{ gap: spacing(3) }}>
      <View style={styles.headerRow}>
        <Subheading>From Apple Health</Subheading>
        {loaded ? (
          <Pressable onPress={load} disabled={busy}>
            <Text style={styles.link}>{busy ? "…" : "Refresh"}</Text>
          </Pressable>
        ) : null}
      </View>

      {!loaded ? (
        <Pressable
          style={({ pressed }) => [styles.connectBtn, { opacity: pressed || busy ? 0.85 : 1 }]}
          onPress={connect}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <>
              <Ionicons name="heart-outline" size={18} color={colors.text} />
              <Text style={styles.connectText}>Connect Apple Health</Text>
            </>
          )}
        </Pressable>
      ) : workouts && workouts.length > 0 ? (
        workouts.map((w) => <WorkoutRow key={w.uuid} workout={w} />)
      ) : (
        <Text style={styles.muted}>
          No recent workouts found. Record one in Apple Health, or check Stride&apos;s
          access in Settings → Health.
        </Text>
      )}
    </View>
  );
}

function WorkoutRow({ workout }: { workout: HKWorkout }) {
  const meta = workoutMeta(workout.workoutActivityType);
  const stats = [
    formatHealthDistance(workout.totalDistance?.quantity),
    formatHealthDuration(workout.duration),
    formatHealthEnergy(workout.totalEnergyBurned?.quantity),
  ].filter(Boolean);
  const date = workout.startDate.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={meta.icon} size={18} color={colors.ember} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{meta.label}</Text>
        <Text style={styles.stats}>{stats.join("  ·  ")}</Text>
      </View>
      <Text style={styles.date}>{date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  muted: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.body },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  connectText: { color: colors.text, fontFamily: fonts.display, fontSize: 15, letterSpacing: 0.2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodyBold },
  stats: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.mono, letterSpacing: 0.3, marginTop: 2 },
  date: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.mono, textTransform: "uppercase", letterSpacing: 0.5 },
  link: { color: colors.ember, fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
});
