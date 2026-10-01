import {
  Pressable,
  Text,
  View,
  ScrollView,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
  type RefreshControlProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode, ReactElement } from "react";
export const colors = {
  background: "#0e1618",
  surface: "#192427",
  border: "#2c3e40",
  text: "#eef5f2",
  muted: "#a8b9b6",
  accent: "#bcead7",
  error: "#ffb4ab",
};
export function Screen({
  children,
  refreshControl,
}: {
  children: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Heading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ gap: 10, marginBottom: 6 }}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {subtitle && <Text style={styles.body}>{subtitle}</Text>}
    </View>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Copy({
  children,
  strong = false,
}: {
  children: ReactNode;
  strong?: boolean;
}) {
  return <Text style={strong ? styles.subtitle : styles.body}>{children}</Text>;
}
export function Action({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text
        style={{
          color: secondary ? colors.text : colors.background,
          fontSize: 16,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.body}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}
export function Feedback({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={{ color: error ? colors.error : colors.accent, lineHeight: 22 }}
    >
      {message}
    </Text>
  ) : null;
}
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 24, gap: 20, paddingBottom: 36 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accent,
    fontWeight: "700",
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -1,
  },
  subtitle: { fontSize: 21, fontWeight: "600", color: colors.text },
  body: { fontSize: 15, lineHeight: 23, color: colors.muted },
  card: {
    padding: 21,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    minHeight: 50,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 52,
    padding: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
