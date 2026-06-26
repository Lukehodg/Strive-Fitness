import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";

import { Button, Heading, Muted, Screen } from "@/components/ui";
import { spacing } from "@/components/theme";
import {
  appleAvailable,
  signInWithApple,
  signInWithGoogleIdToken,
} from "@/lib/auth";
import { env, isSupabaseConfigured } from "@/lib/env";

// Required for the OAuth popup to close cleanly after redirect.
WebBrowser.maybeCompleteAuthSession();

/**
 * Google button lives in its own component so the `useIdTokenAuthRequest` hook
 * is only ever called when Google client IDs are configured. Calling that hook
 * with no client id throws on a native build — which previously crashed the
 * whole sign-in screen. Mount this only when `env.googleWebClientId` is set.
 */
function GoogleSignInButton({ setBusy }: { setBusy: (b: boolean) => void }) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId || undefined,
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params.id_token ?? response.authentication?.idToken;
    if (!idToken) return;
    (async () => {
      try {
        setBusy(true);
        await signInWithGoogleIdToken(idToken);
      } catch (e) {
        Alert.alert("Google sign-in", e instanceof Error ? e.message : "Could not sign in.");
      } finally {
        setBusy(false);
      }
    })();
  }, [response, setBusy]);

  return (
    <Button
      title="Continue with Google"
      variant="secondary"
      onPress={() => promptAsync()}
      disabled={!request}
    />
  );
}

export default function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const googleEnabled = env.googleWebClientId.length > 0;

  async function withApple() {
    try {
      setBusy(true);
      await signInWithApple();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not sign in.";
      // Ignore user-cancelled flows (Apple/native dialogs).
      if (!/cancel/i.test(msg)) Alert.alert("Sign in", msg);
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
          {!isSupabaseConfigured ? (
            <Muted>
              ⚠️ Backend not configured. Copy .env.example to .env and add your Supabase
              keys to sign in. See SETUP.md.
            </Muted>
          ) : null}

          {appleAvailable ? (
            <Button title="Continue with Apple" onPress={withApple} loading={busy} />
          ) : null}

          {googleEnabled ? (
            <GoogleSignInButton setBusy={setBusy} />
          ) : (
            <Button
              title="Continue with Google"
              variant="secondary"
              onPress={() =>
                Alert.alert(
                  "Google sign-in",
                  "Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to enable Google sign-in (see SETUP.md).",
                )
              }
            />
          )}

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
