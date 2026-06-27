import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { formatDistance, formatStartTime } from "@/lib/format";
import { eventTypeLabel } from "@/lib/event-format";
import type { EventType } from "@/types/database";

export type EventCardData = {
  id: string;
  title: string;
  event_type: EventType;
  venue_label: string;
  starts_at: string;
  distance_km?: number | null;
  distance_meters?: number | null;
};

export function EventCard({ event, onPress }: { event: EventCardData; onPress: () => void }) {
  const distance =
    event.distance_meters != null
      ? formatDistance(event.distance_meters).replace(" away", "").toUpperCase()
      : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.tags}>
        <View style={[styles.tag, styles.tagAccent]}>
          <Text style={styles.tagTextAccent}>{eventTypeLabel(event.event_type)}</Text>
        </View>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{formatStartTime(event.starts_at).toUpperCase()}</Text>
        </View>
        {distance ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{distance}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {event.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {event.venue_label}
        {event.distance_km != null ? ` · ${event.distance_km} km` : ""}
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
    shadowColor: "#17140F",
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
  // Events lean on pine (the "outdoors" brand colour) to distinguish from games.
  tagAccent: { backgroundColor: colors.pine },
  tagText: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.6, color: colors.ember },
  tagTextAccent: { fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.6, color: "#F3EEE5" },
  title: { color: colors.text, fontSize: font.h3, fontFamily: fonts.display, letterSpacing: -0.3 },
  meta: { color: colors.textMuted, fontSize: font.small, fontFamily: fonts.body },
});
