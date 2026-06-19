import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";

import { Button, Heading, Muted, Screen } from "@/components/ui";
import { colors, spacing } from "@/components/theme";
import { appleAvailable, signInWithApple } from "@/lib/auth";

export default function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function withApple() {
    try {
      setBusy(true);
      await signInWithApple();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not sign in.";
      if (!msg.includes("canceled")) Alert.alert("Sign in", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.hero}>
          <Heading>Strive</Heading>
          <Muted>Find a game near you. Men-only, verified, real-world.</Muted>
        </View>

        <View style={styles.actions}>
          {appleAvailable ? (
            <Button title="Continue with Apple" onPress={withApple} loading={busy} />
          ) : null}

          {/* Google: wire the id_token retrieval, then call signInWithGoogleIdToken */}
          <Button
            title="Continue with Google"
            variant="secondary"
            onPress={() =>
              Alert.alert(
                "Google sign-in",
                "Add your Google OAuth client IDs in .env, then connect expo-auth-session to retrieve an id_token. See SETUP.md.",
              )
            }
          />

          <Button
            title="Continue with phone"
            variant="secondary"
            onPress={() => router.push("/(auth)/verify-phone")}
          />

          <Muted>By continuing you agree this is a platonic, men-only space.</Muted>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing(6), justifyContent: "space-between" },
  hero: { marginTop: spacing(16), gap: spacing(3) },
  actions: { gap: spacing(3), marginBottom: spacing(8) },
});

export const unstable_settings = { headerBackgroundColor: colors.bg };
