import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { colors, fonts, radius, spacing } from "@/components/theme";
import { earnedBadges, nextBadge } from "@/lib/badges";
import type { PlayerStats } from "@/types/database";

/**
 * Earned achievement chips. `showNext` adds the first unearned badge as a
 * locked chip — the "one more to unlock" nudge for your own profile.
 */
export function BadgeRow({ stats, showNext }: { stats: PlayerStats; showNext?: boolean }) {
  const earned = earnedBadges(stats);
  const next = showNext ? nextBadge(stats) : null;
  if (earned.length === 0 && !next) return null;

  return (
    <View style={styles.row}>
      {earned.map((b) => (
        <View key={b.id} style={styles.chip}>
          <Ionicons name={b.icon} size={12} color={colors.ember} />
          <Text style={styles.label}>{b.label}</Text>
        </View>
      ))}
      {next ? (
        <View style={[styles.chip, styles.chipLocked]}>
          <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
          <Text style={[styles.label, styles.labelLocked]}>{next.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.25),
  },
  chipLocked: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    color: colors.ember,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  labelLocked: { color: colors.textMuted },
});
