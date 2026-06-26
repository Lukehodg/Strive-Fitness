import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, font, radius, spacing } from "@/components/theme";
import { formatDistance, formatRoster, formatStartTime } from "@/lib/format";
import { statusLabel } from "@/lib/activity-format";
import type { ActivityStatus } from "@/types/database";

export type GameCardData = {
  id: string;
  title: string;
  venue_label: string;
  starts_at: string;
  status: ActivityStatus;
  max_players: number;
  joined_count?: number;
  distance_meters?: number;
};

export function GameCard({ game, onPress }: { game: GameCardData; onPress: () => void }) {
  const full = game.status === "full";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {game.title}
        </Text>
        <View style={[styles.badge, full && styles.badgeFull]}>
          <Text style={[styles.badgeText, full && styles.badgeTextFull]}>
            {statusLabel(game.status)}
          </Text>
        </View>
      </View>

      <Text style={styles.meta}>{formatStartTime(game.starts_at)}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        📍 {game.venue_label}
        {game.distance_meters != null ? ` · ${formatDistance(game.distance_meters)}` : ""}
      </Text>

      <View style={styles.footer}>
        <Text style={styles.roster}>
          {game.joined_count != null
            ? formatRoster(game.joined_count, game.max_players)
            : `${game.max_players} max`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(1.5),
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "700", flex: 1 },
  meta: { color: colors.textMuted, fontSize: font.small },
  footer: { marginTop: spacing(1), flexDirection: "row", justifyContent: "space-between" },
  roster: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  badge: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  badgeFull: { backgroundColor: colors.warning },
  badgeText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  badgeTextFull: { color: "#1A1206" },
});
