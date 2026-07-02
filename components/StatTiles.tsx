import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radius, spacing } from "@/components/theme";
import { sportLabel } from "@/lib/sports";
import type { PlayerStats } from "@/types/database";

/** The competitive at-a-glance strip: played / hosted / this month / sports. */
export function StatTiles({ stats }: { stats: PlayerStats }) {
  return (
    <View style={{ gap: spacing(2) }}>
      <View style={styles.row}>
        <Tile label="Played" value={stats.games_played} />
        <Tile label="Hosted" value={stats.games_hosted} />
        <Tile label="This month" value={stats.games_this_month} highlight />
        <Tile label="Sports" value={stats.sports_count} />
      </View>
      {stats.top_sport && stats.top_sport_count > 0 ? (
        <Text style={styles.topSport}>
          Mostly {sportLabel(stats.top_sport).toLowerCase()} · {stats.top_sport_count}{" "}
          {stats.top_sport_count === 1 ? "time" : "times"}
        </Text>
      ) : null}
    </View>
  );
}

function Tile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <View style={[styles.tile, highlight && styles.tileHighlight]}>
      <Text style={[styles.value, highlight && styles.valueHighlight]}>{value}</Text>
      <Text style={[styles.label, highlight && styles.labelHighlight]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing(2) },
  tile: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(1),
  },
  tileHighlight: { backgroundColor: colors.primary, borderColor: colors.primary },
  value: { color: colors.text, fontFamily: fonts.displayBlack, fontSize: 22, letterSpacing: -0.5 },
  valueHighlight: { color: colors.primaryText },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  labelHighlight: { color: colors.primaryText },
  topSport: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 },
});
