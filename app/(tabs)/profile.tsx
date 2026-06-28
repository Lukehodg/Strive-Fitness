import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, Card, Heading, Loading, Muted, Screen, Subheading } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { StravaSection } from "@/components/StravaSection";
import { HealthSection } from "@/components/HealthSection";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { usePendingInviteCount } from "@/hooks/useInvites";

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const { data: pendingInvites } = usePendingInviteCount();

  if (isLoading) return <Loading />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Avatar name={profile?.display_name ?? "Player"} url={profile?.avatar_url} size={96} />
          <Heading>{profile?.display_name ?? "Player"}</Heading>
          {profile?.area_label ? (
            <Text style={styles.area}>{profile.area_label}</Text>
          ) : null}
        </View>

        <Card style={styles.verifyRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
            <Ionicons
              name={profile?.phone_verified ? "shield-checkmark" : "shield-outline"}
              size={22}
              color={profile?.phone_verified ? colors.primary : colors.warning}
            />
            <View>
              <Subheading>{profile?.phone_verified ? "Phone verified" : "Not verified"}</Subheading>
              <Muted>
                {profile?.phone_verified
                  ? "You can host and join games."
                  : "Verify to host or join games."}
              </Muted>
            </View>
          </View>
          {!profile?.phone_verified ? (
            <Button
              title="Verify"
              style={{ height: 40, paddingHorizontal: spacing(4) }}
              onPress={() => router.push("/(auth)/verify-phone")}
            />
          ) : null}
        </Card>

        {profile?.bio ? (
          <Card>
            <Muted>{profile.bio}</Muted>
          </Card>
        ) : null}

        <StravaSection />

        <HealthSection />

        <Pressable
          style={({ pressed }) => [styles.linkRow, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => router.push("/invites")}
        >
          <Ionicons name="mail-outline" size={20} color={colors.text} />
          <Text style={styles.linkText}>Invites</Text>
          {pendingInvites ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingInvites}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Button
          title="Connections"
          variant="secondary"
          onPress={() => router.push("/connections")}
        />
        <Button title="Edit profile" onPress={() => router.push("/edit-profile")} />
        <Button
          title="Sign out"
          variant="secondary"
          onPress={() =>
            Alert.alert("Sign out", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => signOut() },
            ])
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(5), gap: spacing(4), paddingBottom: spacing(10) },
  head: { alignItems: "center", gap: spacing(2), marginTop: spacing(4) },
  area: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  verifyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(3) },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
  },
  linkText: { flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.bodyBold },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(1.5),
  },
  badgeText: { color: colors.primaryText, fontFamily: fonts.monoBold, fontSize: 11 },
});
