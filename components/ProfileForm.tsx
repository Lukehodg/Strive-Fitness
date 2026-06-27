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
import * as ImagePicker from "expo-image-picker";

import { Button, Field, Muted } from "@/components/ui";
import { colors, radius, spacing } from "@/components/theme";
import { useAuth } from "@/hooks/useAuth";
import { useUpsertProfile } from "@/hooks/useProfile";
import { uploadAvatar } from "@/lib/storage";
import { getCurrentCoords, reverseGeocodeArea, type Coords } from "@/lib/location";

export type ProfileFormInitial = {
  display_name?: string | null;
  area_label?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
};

/**
 * Shared profile editor used by both create-profile and edit-profile. Handles
 * the avatar pick/upload, optional "use my location", validation and the upsert.
 */
export function ProfileForm({
  initial,
  submitLabel,
  onDone,
}: {
  initial?: ProfileFormInitial;
  submitLabel: string;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const upsert = useUpsertProfile();

  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [areaLabel, setAreaLabel] = useState(initial?.area_label ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  // Existing avatar (remote URL) vs a freshly picked local image to upload.
  const [existingAvatar] = useState<string | null>(initial?.avatar_url ?? null);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);

  const shownAvatar = pickedUri ?? existingAvatar;

  async function pickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
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
      // Only re-upload when the user picked a new image; otherwise keep what's there.
      let avatarUrl = existingAvatar;
      if (pickedUri && user) {
        avatarUrl = await uploadAvatar(user.id, pickedUri);
      }
      await upsert.mutateAsync({
        display_name: displayName.trim(),
        area_label: areaLabel.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        location: coords,
      });
      onDone();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
          {shownAvatar ? (
            <Image source={{ uri: shownAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Muted>Add photo</Muted>
            </View>
          )}
          <Muted>Tap to change photo</Muted>
        </Pressable>

        <View style={{ gap: spacing(4) }}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Jamie" />
          <Field label="Area" value={areaLabel} onChangeText={setAreaLabel} placeholder="Weybridge" />
          <Button title="Use my current location" variant="secondary" onPress={useMyLocation} />
          <Field
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            placeholder="5-a-side regular, right back."
            multiline
          />
        </View>

        <Button title={submitLabel} onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing(6), gap: spacing(5), paddingTop: spacing(6) },
  avatarWrap: { alignSelf: "center", alignItems: "center", gap: spacing(2) },
  avatar: { width: 96, height: 96, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
