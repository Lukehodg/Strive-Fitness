import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button, Card, Heading, Loading, Muted, Screen, Subheading } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { colors, fonts, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";

export default function ProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: profile, isLoading } = useMyProfile();

  if (isLoading) return <Loading />;

  return (
    <Screen>
      <View style={styles.container}>
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

        <View style={{ flex: 1 }} />

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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing(5), gap: spacing(4) },
  head: { alignItems: "center", gap: spacing(2), marginTop: spacing(4) },
  area: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  verifyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(3) },
});
