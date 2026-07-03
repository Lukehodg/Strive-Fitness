import { Alert, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, Card, Heading, Loading, Muted, Screen } from "@/components/ui";
import { colors, font, fonts, radius, spacing } from "@/components/theme";
import { useEvent, useEventGoing, useToggleEventRsvp } from "@/hooks/useEvents";
import { eventTypeLabel } from "@/lib/event-format";
import { formatStartTime } from "@/lib/format";

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = id!;
  const { data: event, isLoading } = useEvent(eventId);
  const { data: going } = useEventGoing(eventId);
  const toggle = useToggleEventRsvp(eventId);

  if (isLoading || !event) return <Loading />;

  async function openLink() {
    if (!event?.external_url) return;
    const ok = await Linking.canOpenURL(event.external_url);
    if (ok) Linking.openURL(event.external_url);
    else Alert.alert("Can't open link", event.external_url);
  }

  return (
    <Screen edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.typeTag}>
          <Text style={styles.typeTagText}>{eventTypeLabel(event.event_type)}</Text>
        </View>

        <Heading>{event.title}</Heading>

        <Card style={{ gap: spacing(2.5) }}>
          <Row icon="calendar" text={formatStartTime(event.starts_at)} />
          <Row icon="location" text={event.venue_label} />
          {event.distance_km != null ? <Row icon="walk" text={`${event.distance_km} km`} /> : null}
          {event.organizer ? <Row icon="people" text={`Organised by ${event.organizer}`} /> : null}
        </Card>

        {event.description ? (
          <Card>
            <Muted>{event.description}</Muted>
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={going ? "✓ Going" : "I'm going"}
          variant={going ? "secondary" : "primary"}
          loading={toggle.isPending}
          onPress={() => toggle.mutate(!going)}
        />
        {event.external_url ? (
          <Button title="Register / more info" variant="secondary" onPress={openLink} />
        ) : null}
      </View>
    </Screen>
  );
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(8) },
  typeTag: {
    alignSelf: "flex-start",
    backgroundColor: colors.pine,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  typeTagText: { color: "#EDF0F5", fontFamily: fonts.monoBold, fontSize: 11, letterSpacing: 0.6 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  metaText: { color: colors.text, fontSize: font.body, fontFamily: fonts.body },
  footer: {
    padding: spacing(5),
    gap: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
