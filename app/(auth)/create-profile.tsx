import { useRouter } from "expo-router";
import { View } from "react-native";

import { Heading, Muted, Screen } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { spacing } from "@/components/theme";

export default function CreateProfileScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={{ paddingHorizontal: spacing(6), paddingTop: spacing(8), gap: spacing(2) }}>
        <Heading>Create your profile</Heading>
        <Muted>This is what other players see when you join a game.</Muted>
      </View>
      <ProfileForm submitLabel="Save & continue" onDone={() => router.replace("/(tabs)")} />
    </Screen>
  );
}
