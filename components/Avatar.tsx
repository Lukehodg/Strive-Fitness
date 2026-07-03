import { Image, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "@/components/theme";

// Brand-palette backgrounds for initial avatars (from the brand kit).
// fg is theme-derived so the pairs stay readable in dark mode too (e.g. the
// `colors.text` chip flips ink-on-bone → bone-on-ink instead of bone-on-bone).
const PALETTE = [
  { bg: colors.primary, fg: colors.primaryText },
  { bg: colors.pine, fg: "#EDF0F5" },
  { bg: colors.ember, fg: "#101828" },
  { bg: colors.text, fg: colors.bg },
  { bg: colors.textMuted, fg: colors.bg },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

function paletteFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

/** Circular avatar: shows the photo if present, otherwise brand-coloured initials. */
export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return <Image source={{ uri: url }} style={[dim, styles.image]} />;
  }

  const { bg, fg } = paletteFor(name);
  return (
    <View style={[dim, styles.fallback, { backgroundColor: bg }]}>
      <Text style={[styles.initials, { color: fg, fontSize: size * 0.4 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceAlt },
  fallback: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.monoBold, letterSpacing: 0.5 },
});
