import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { formatDistance, formatRoster, formatStartTime } from "@/lib/format";
import { statusLabel } from "@/lib/activity-format";
import { isFootball, sportLabel } from "@/lib/sports";
import type { ActivityStatus, ActivityType, GameFormat } from "@/types/database";

export type GameCardData = {
  id: string;
  title: string;
  venue_label: string;
  starts_at: string;
  status: ActivityStatus;
  max_players: number;
  activity_type?: ActivityType;
  format?: GameFormat;
  joined_count?: number;
  distance_meters?: number;
};

/** Mono uppercase data chip (kickoff time, distance, status). */
function Tag({ children, tone = "default" }: { children: string; tone?: "default" | "alert" }) {
  return (
    <View style={[styles.tag, tone === "alert" && styles.tagAlert]}>
      <Text style={[styles.tagText, tone === "alert" && styles.tagTextAlert]}>{children}</Text>
    </View>
  );
}

export function GameCard({ game, onPress }: { game: GameCardData; onPress: () => void }) {
  const full = game.status === "full";
  const distance =
    game.distance_meters != null
      ? formatDistance(game.distance_meters).replace(" away", "").toUpperCase()
      : null;
  // Football leads with its format (e.g. KICKABOUT); other sports lead with
  // the sport itself (GYM, RUNNING…).
  const primaryTag =
    game.activity_type && !isFootball(game.activity_type)
      ? sportLabel(game.activity_type).toUpperCase()
      : (game.format ?? "football").toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={styles.tags}>
        <Tag>{primaryTag}</Tag>
        <Tag>{formatStartTime(game.starts_at).toUpperCase()}</Tag>
        {distance ? <Tag>{distance}</Tag> : null}
        {full ? <Tag tone="alert">FULL</Tag> : null}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {game.title}
      </Text>

      <Text style={styles.meta} numberOfLines={1}>
        {game.venue_label}
        {game.joined_count != null
          ? ` · ${formatRoster(game.joined_count, game.max_players)}`
          : ` · ${game.max_players} max`}
        {!full && game.status !== "open" ? ` · ${statusLabel(game.status)}` : ""}
      </Text>
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
    gap: spacing(2),
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) },
  tag: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  tagAlert: { backgroundColor: colors.primary },
  tagText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.ember,
  },
  tagTextAlert: { color: colors.primaryText },
  title: { color: colors.text, fontSize: font.h3, fontFamily: fonts.display, letterSpacing: -0.3 },
  meta: { color: colors.textMuted, fontSize: font.small, fontFamily: fonts.body },
});
