import { SectionList, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState, Heading, Muted, Screen } from "@/components/ui";
import { GameCard } from "@/components/GameCard";
import { GameListSkeleton } from "@/components/Skeleton";
import { colors, font, fonts, spacing } from "@/components/theme";
import { useMyGames, type MyGame } from "@/hooks/useMyGames";

export default function MyGamesScreen() {
  const router = useRouter();
  const { data, isLoading, refetch, isRefetching } = useMyGames();

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.header}>
          <Heading>My Games</Heading>
          <Muted>Games you're hosting or have joined</Muted>
        </View>
        <GameListSkeleton count={3} />
      </Screen>
    );
  }

  const now = Date.now();
  const upcoming = (data ?? []).filter((g: MyGame) => +new Date(g.starts_at) >= now);
  const past = (data ?? []).filter((g: MyGame) => +new Date(g.starts_at) < now);

  const sections = [
    { title: "Upcoming", data: upcoming },
    { title: "Past", data: past },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen>
      <View style={styles.header}>
        <Heading>My Games</Heading>
        <Muted>Games you're hosting or have joined</Muted>
      </View>

      {sections.length === 0 ? (
        <EmptyState
          title="No games yet"
          message="Join a game from Discover, or host your own. They'll show up here."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing(3.5) }}>
              <GameCard
                game={{
                  id: item.id,
                  title: item.title,
                  venue_label: item.venue_label,
                  starts_at: item.starts_at,
                  status: item.status,
                  max_players: item.max_players,
                }}
                onPress={() => router.push({ pathname: "/game/[id]", params: { id: item.id } })}
              />
              {item.hosting ? <Text style={styles.hosting}>You're hosting</Text> : null}
            </View>
          )}
        />
      )}
    </Screen>
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
  hosting: { color: colors.ember, fontSize: font.small, marginTop: spacing(1.5), fontFamily: fonts.mono },
});
