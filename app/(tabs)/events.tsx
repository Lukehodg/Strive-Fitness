import { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, EmptyState, Heading, Screen } from "@/components/ui";
import { EventCard } from "@/components/EventCard";
import { GameListSkeleton } from "@/components/Skeleton";
import { colors, fonts, spacing } from "@/components/theme";
import { useUpcomingEvents } from "@/hooks/useEvents";
import { DEFAULT_REGION, getCurrentCoords, type Coords } from "@/lib/location";
import type { UpcomingEvent } from "@/types/database";

export default function EventsScreen() {
  const router = useRouter();
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    getCurrentCoords().then((c) => setCoords(c ?? DEFAULT_REGION));
  }, []);

  const { data, isLoading, isError, refetch, isRefetching } = useUpcomingEvents(coords);
  const count = data?.length ?? 0;
  const countLabel =
    !coords || isLoading
      ? "Parkruns, races & more"
      : count === 0
        ? "No events listed yet"
        : `${count} upcoming event${count === 1 ? "" : "s"}`;

  return (
    <Screen>
      <View style={styles.header}>
        <Heading>Events</Heading>
        <Text style={styles.count}>{countLabel}</Text>
      </View>

      {!coords || isLoading ? (
        <GameListSkeleton />
      ) : isError ? (
        <View style={{ flex: 1, padding: spacing(6), gap: spacing(4) }}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load events"
            message="Check your connection and try again."
          />
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderItem={({ item }: { item: UpcomingEvent }) => (
            <EventCard
              event={{
                id: item.id,
                title: item.title,
                event_type: item.event_type,
                venue_label: item.venue_label,
                starts_at: item.starts_at,
                distance_km: item.distance_km,
                distance_meters: item.distance_meters,
              }}
              onPress={() => router.push({ pathname: "/event/[id]", params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="trophy-outline"
              title="No events yet"
              message="Parkruns and races near you will show up here as they're added."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing(5), paddingTop: spacing(2), paddingBottom: spacing(2.5), gap: spacing(1) },
  count: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  list: { padding: spacing(5), gap: spacing(3.5), paddingBottom: spacing(10) },
});
