import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Subheading } from "@/components/ui";
import { colors, fonts, radius, spacing } from "@/components/theme";
import { useDeleteAccount, useExportData } from "@/hooks/useAccount";
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal";

/** Privacy & data: policy/terms links + GDPR export and delete. */
export function AccountDataSection() {
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount();

  async function onExport() {
    try {
      const data = await exportData.mutateAsync();
      await Share.share({
        title: "My Stride data",
        message: JSON.stringify(data, null, 2),
      });
    } catch (e) {
      Alert.alert("Export", e instanceof Error ? e.message : "Couldn't export your data.");
    }
  }

  function onDelete() {
    Alert.alert(
      "Delete account?",
      "This permanently erases your profile, games, messages, connections and any linked Strava data. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: () =>
            deleteAccount
              .mutateAsync()
              .catch((e) =>
                Alert.alert("Delete", e instanceof Error ? e.message : "Couldn't delete the account."),
              ),
        },
      ],
    );
  }

  return (
    <View style={{ gap: spacing(2.5) }}>
      <Subheading>Privacy &amp; data</Subheading>

      <LinkRow icon="document-text-outline" label="Privacy policy" onPress={() => Linking.openURL(PRIVACY_URL)} />
      <LinkRow icon="reader-outline" label="Terms of use" onPress={() => Linking.openURL(TERMS_URL)} />
      <LinkRow
        icon="download-outline"
        label={exportData.isPending ? "Preparing…" : "Export my data"}
        onPress={onExport}
        disabled={exportData.isPending}
      />
      <LinkRow
        icon="trash-outline"
        label={deleteAccount.isPending ? "Deleting…" : "Delete account"}
        onPress={onDelete}
        disabled={deleteAccount.isPending}
        danger
      />
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  disabled,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const tint = danger ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, { opacity: pressed || disabled ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
  },
  label: { flex: 1, fontSize: 15, fontFamily: fonts.bodyBold },
});
