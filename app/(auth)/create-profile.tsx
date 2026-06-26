import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

import { Button, Field, Heading, Muted, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useUpsertProfile } from "@/hooks/useProfile";
import { uploadAvatar } from "@/lib/storage";
import { getCurrentCoords, reverseGeocodeArea, type Coords } from "@/lib/location";

export default function CreateProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const upsert = useUpsertProfile();

  const [displayName, setDisplayName] = useState("");
  const [areaLabel, setAreaLabel] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function useMyLocation() {
    const c = await getCurrentCoords();
    if (!c) {
      Alert.alert("Location off", "Enable location to set your home area, or type it in.");
      return;
    }
    setCoords(c);
    const area = await reverseGeocodeArea(c);
    if (area && !areaLabel) setAreaLabel(area);
  }

  async function save() {
    if (displayName.trim().length < 2) {
      Alert.alert("Name needed", "Enter a display name (2+ characters).");
      return;
    }
    try {
      setBusy(true);
      let avatarUrl: string | null = null;
      if (avatarUri && user) {
        avatarUrl = await uploadAvatar(user.id, avatarUri);
      }
      await upsert.mutateAsync({
        display_name: displayName.trim(),
        area_label: areaLabel.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        location: coords,
      });
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing(2) }}>
          <Heading>Create your profile</Heading>
          <Muted>This is what other players see when you join a game.</Muted>
        </View>

        <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Muted>Add photo</Muted>
            </View>
          )}
        </Pressable>

        <View style={{ gap: spacing(4) }}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Jamie" />
          <Field
            label="Area"
            value={areaLabel}
            onChangeText={setAreaLabel}
            placeholder="Weybridge"
          />
          <Button title="Use my current location" variant="secondary" onPress={useMyLocation} />
          <Field
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            placeholder="5-a-side regular, right back."
            multiline
          />
        </View>

          <Button title="Save & continue" onPress={save} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing(6), gap: spacing(5), paddingTop: spacing(10) },
  avatarWrap: { alignSelf: "center" },
  avatar: { width: 96, height: 96, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
