import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../lib/session";
import { Screen, Copy, Action, Feedback, colors } from "../components/ui";
function Navigation() {
  const { user, loading, error, retry } = useSession();
  if (loading)
    return (
      <Screen>
        <Copy>Opening Strive…</Copy>
      </Screen>
    );
  if (error)
    return (
      <Screen>
        <Feedback message={error} error />
        <Action
          label="Try again"
          onPress={() => {
            void retry();
          }}
        />
      </Screen>
    );
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="workouts/create" />
        <Stack.Screen name="workouts/plan" />
        <Stack.Screen name="coach/[id]" />
        <Stack.Screen name="workouts/session/[id]" />
        <Stack.Screen name="routine/edit" />
        <Stack.Screen name="account" />
        <Stack.Screen name="mail" />
      </Stack.Protected>
    </Stack>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Navigation />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
