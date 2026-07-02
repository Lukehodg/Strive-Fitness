import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Card, Heading, Loading, Muted, Screen, Subheading } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { BadgeRow } from "@/components/BadgeRow";
import { StatTiles } from "@/components/StatTiles";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { usePlayedTogether, usePlayerStats, useUserProfile } from "@/hooks/useStats";
import { useStravaActivities } from "@/hooks/useStrava";
import {
  STRAVA_ORANGE,
  formatStravaDistance,
  formatStravaDuration,
  stravaSportIcon,
  stravaSportLabel,
} from "@/lib/strava";
import type { StravaActivity } from "@/types/database";

/**
 * Another player's profile: basics for everyone, stats + recent training only
 * once you're connected (the friends-gate lives server-side in player_stats).
 */
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: profile, isLoading } = useUserProfile(id);
  const { data: stats, isLoading: statsLoading } = usePlayerStats(id);
  const { data: stravaActivities } = useStravaActivities(id);
  const { data: together } = usePlayedTogether(id);

  if (isLoading) return <Loading />;

  if (!profile) {
    return (
      <Screen edges={["bottom", "left", "right"]}>
        <View style={styles.center}>
          <Muted>This profile isn&apos;t available.</Muted>
        </View>
      </Screen>
    );
  }

  const since = new Date(profile.created_at).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
  const training = (stravaActivities ?? []).slice(0, 5);

  return (
    <Screen edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Avatar name={profile.display_name} url={profile.avatar_url} size={88} />
          <Heading>{profile.display_name}</Heading>
          <Text style={styles.metaLine}>
            {[profile.area_label, `Since ${since}`].filter(Boolean).join("  ·  ")}
          </Text>
          {together ? (
            <View style={styles.togetherPill}>
              <Ionicons name="people" size={12} color={colors.ember} />
              <Text style={styles.togetherText}>
                Played together {together} {together === 1 ? "time" : "times"}
              </Text>
            </View>
          ) : null}
        </View>

        {profile.bio ? (
          <Card>
            <Muted>{profile.bio}</Muted>
          </Card>
        ) : null}

        <Subheading>Stats</Subheading>
        {statsLoading ? null : stats ? (
          <>
            <StatTiles stats={stats} />
            <BadgeRow stats={stats} />
          </>
        ) : (
          <Card style={styles.lockedCard}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <Muted>
              Stats unlock between connections — play together and tap “Play again” to
              add each other.
            </Muted>
          </Card>
        )}

        {stats && training.length > 0 ? (
          <>
            <View style={styles.trainingHeader}>
              <Subheading>Recent training</Subheading>
              <Text style={styles.powered}>Powered by Strava</Text>
            </View>
            {training.map((a: StravaActivity) => (
              <View key={a.id} style={styles.trainingRow}>
                <View style={styles.trainingIcon}>
                  <Ionicons name={stravaSportIcon(a.sport_type)} size={16} color={STRAVA_ORANGE} />
                </View>
                <Text style={styles.trainingName} numberOfLines={1}>
                  {a.name ?? stravaSportLabel(a.sport_type)}
                </Text>
                <Text style={styles.trainingStats}>
                  {[formatStravaDistance(a.distance_m), formatStravaDuration(a.moving_time_s)]
                    .filter((s) => s !== "—")
                    .join(" · ")}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(10) },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing(8) },
  head: { alignItems: "center", gap: spacing(2), marginTop: spacing(2) },
  metaLine: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  togetherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    marginTop: spacing(1),
  },
  togetherText: {
    color: colors.ember,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  lockedCard: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  trainingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  powered: {
    color: STRAVA_ORANGE,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  trainingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2.5),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(3),
  },
  trainingIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  trainingName: { flex: 1, color: colors.text, fontSize: 14, fontFamily: fonts.bodyBold },
  trainingStats: { color: colors.textMuted, fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.3 },
});
