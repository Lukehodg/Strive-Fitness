import { SectionList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, Heading, Muted, Screen } from "@/components/ui";
import { GameCard } from "@/components/GameCard";
import { EventCard } from "@/components/EventCard";
import { GameListSkeleton } from "@/components/Skeleton";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useMyGames, type MyGame } from "@/hooks/useMyGames";
import { useMyEvents } from "@/hooks/useEvents";
import type { Event } from "@/types/database";

type Item = MyGame | Event;
type SectionMeta = { title: string; kind: "game" | "event" };

export default function MyGamesScreen() {
  const router = useRouter();
  const games = useMyGames();
  const events = useMyEvents();

  if (games.isLoading) {
    return (
      <Screen>
        <View style={styles.header}>
          <Heading>My Games</Heading>
          <Muted>Your activities and events</Muted>
        </View>
        <GameListSkeleton count={3} />
      </Screen>
    );
  }

  const now = Date.now();
  const upcoming = (games.data ?? []).filter((g: MyGame) => +new Date(g.starts_at) >= now);
  const past = (games.data ?? []).filter((g: MyGame) => +new Date(g.starts_at) < now);
  const myEvents = events.data ?? [];

  const sections: (SectionMeta & { data: Item[] })[] = [
    { title: "Upcoming", kind: "game" as const, data: upcoming },
    { title: "Events you're going to", kind: "event" as const, data: myEvents },
    { title: "Past", kind: "game" as const, data: past },
  ].filter((s) => s.data.length > 0);

  const onRefresh = () => {
    games.refetch();
    events.refetch();
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Heading>My Games</Heading>
        <Muted>Your activities and events</Muted>
      </View>

      {sections.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing yet"
          message="Join something from Discover, or say you're going to an event — it'll show up here."
        />
      ) : (
        <SectionList<Item, SectionMeta>
          sections={sections}
          keyExtractor={(item) => item.id}
          onRefresh={onRefresh}
          refreshing={games.isRefetching || events.isRefetching}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item, section }) =>
            section.kind === "event" ? (
              <View style={{ marginBottom: spacing(3.5) }}>
                <EventCard
                  event={item as Event}
                  onPress={() =>
                    router.push({ pathname: "/event/[id]", params: { id: item.id } })
                  }
                />
              </View>
            ) : (
              <GameRow game={item as MyGame} onPress={() => router.push({ pathname: "/game/[id]", params: { id: item.id } })} />
            )
          }
        />
      )}
    </Screen>
  );
}

function GameRow({ game, onPress }: { game: MyGame; onPress: () => void }) {
  return (
    <View style={{ marginBottom: spacing(3.5) }}>
      <GameCard
        game={{
          id: game.id,
          title: game.title,
          venue_label: game.venue_label,
          starts_at: game.starts_at,
          status: game.status,
          max_players: game.max_players,
          activity_type: game.activity_type,
          format: game.format,
        }}
        onPress={onPress}
      />
      {game.hosting ? (
        <View style={styles.hostingTag}>
          <Text style={styles.hostingText}>YOU&apos;RE HOSTING</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing(5), paddingTop: spacing(2), paddingBottom: spacing(3) },
  list: { padding: spacing(5), paddingBottom: spacing(10) },
  sectionHeader: {
    color: colors.ember,
    fontSize: 12,
    fontFamily: fonts.monoBold,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing(2.5),
    marginTop: spacing(2),
  },
  hostingTag: {
    alignSelf: "flex-start",
    marginTop: spacing(2),
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
  },
  hostingText: { color: colors.ember, fontFamily: fonts.monoBold, fontSize: 10, letterSpacing: 0.5 },
});
