import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { colors, font, fonts, isDark, radius, spacing } from "@/components/theme";

/** Full-screen container with safe-area + app background. */
export function Screen({
  children,
  edges,
}: {
  children: React.ReactNode;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges ?? ["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

/**
 * Screen heading. `dot` appends the brand's marigold full stop (as in the
 * "Turnout." wordmark) — use it on top-level screen titles, not dynamic text.
 */
export function Heading({ children, dot }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <Text style={styles.heading}>
      {children}
      {dot ? <Text style={styles.headingDot}>.</Text> : null}
    </Text>
  );
}

export function Subheading({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subheading}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/**
 * Editorial eyebrow — the live fact above a screen title ("3 GAMES NEAR YOU").
 * Mono, burnished amber, uppercase. Only use it to say something true and
 * current about the screen, never as decoration.
 */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

/**
 * Section label with the brand's amber full stop leading it — the mark of
 * commitment, echoed from the wordmark. For list sections ("UPCOMING").
 */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.sectionLabelRow}>
      <View style={styles.sectionLabelDot} />
      <Text style={styles.sectionLabelText}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  // Secondary is quiet — surface + hairline, so linen stays a data-chip material
  // and amber stays the only loud thing on screen.
  const bg =
    variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : colors.surface;
  const fg = variant === "secondary" ? colors.text : variant === "danger" ? "#fff" : colors.primaryText;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && !isDisabled ? styles.buttonPrimaryLift : null,
        variant === "secondary" ? styles.buttonSecondary : null,
        {
          backgroundColor: bg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: spacing(1.5) }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        keyboardAppearance={isDark ? "dark" : "light"}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function EmptyState({
  title,
  message,
  icon = "calendar-outline",
}: {
  title: string;
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.ember} />
      </View>
      <Text style={[styles.heading, { fontSize: font.h3, textAlign: "center" }]}>{title}</Text>
      <Text style={[styles.muted, { textAlign: "center" }]}>{message}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  heading: {
    color: colors.text,
    fontSize: font.h1,
    fontFamily: fonts.displayBlack,
    letterSpacing: -0.6,
  },
  headingDot: { color: colors.primary },
  subheading: {
    color: colors.text,
    fontSize: font.h3,
    fontFamily: fonts.display,
    letterSpacing: -0.3,
  },
  muted: { color: colors.textMuted, fontSize: font.body, fontFamily: fonts.body },
  eyebrow: {
    color: colors.ember,
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  sectionLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
  sectionLabelText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.monoBold,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  label: {
    color: colors.textMuted,
    fontSize: font.small,
    fontFamily: fonts.mono,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  button: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(4),
  },
  // Warm lift under the one amber CTA on screen — makes it read as *the* action.
  buttonPrimaryLift: {
    shadowColor: "#B87A0D",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonSecondary: { borderWidth: 1, borderColor: colors.border },
  buttonText: { fontSize: font.body, fontFamily: fonts.display, letterSpacing: 0.2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: font.body,
    fontFamily: fonts.body,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3.5),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    shadowColor: "#101828",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing(8),
    gap: spacing(2),
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(2),
  },
});
