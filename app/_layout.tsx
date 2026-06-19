import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queryClient";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useProfile";
import { Loading } from "@/components/ui";
import { colors } from "@/components/theme";

/**
 * Redirects based on auth + profile state:
 *   - not signed in            -> (auth)/sign-in
 *   - signed in, no profile    -> (auth)/create-profile
 *   - signed in, has profile   -> (tabs)
 * Keeps the gate in one place so no screen has to defend itself.
 */
function RootNavigator() {
  const { session, initializing } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const segments = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === "(auth)";

  useEffect(() => {
    if (initializing) return;
    // Wait for the profile lookup only when we actually have a session.
    if (session && profileLoading) return;

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/sign-in");
      return;
    }

    if (!profile) {
      router.replace("/(auth)/create-profile");
      return;
    }

    if (inAuthGroup) router.replace("/(tabs)");
  }, [session, initializing, profile, profileLoading, inAuthGroup, router]);

  if (initializing || (session && profileLoading)) return <Loading />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="game/[id]"
        options={{ headerShown: true, title: "Game", presentation: "card" }}
      />
      <Stack.Screen
        name="game/create"
        options={{ headerShown: true, title: "Create a game", presentation: "modal" }}
      />
      <Stack.Screen
        name="game/chat/[id]"
        options={{ headerShown: true, title: "Chat" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
