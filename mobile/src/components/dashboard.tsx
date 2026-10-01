import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./ui";

export function Segments<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={design.segments}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option }}
          onPress={() => onChange(option)}
          style={[design.segment, value === option && design.selected]}
        >
          <Text
            style={[
              design.segmentText,
              value === option && { color: colors.background },
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <View style={design.metric}>
      <Text style={design.metricValue}>
        {value}
        <Text style={design.unit}> {suffix}</Text>
      </Text>
      <Text style={design.caption}>{label}</Text>
    </View>
  );
}
export function SectionTitle({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <View style={design.section}>
      <Text accessibilityRole="header" style={design.sectionTitle}>
        {title}
      </Text>
      {detail && <Text style={design.caption}>{detail}</Text>}
    </View>
  );
}
export const design = StyleSheet.create({
  segments: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    padding: 4,
    borderRadius: 16,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  selected: { backgroundColor: colors.accent },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  hero: {
    backgroundColor: "#203630",
    borderRadius: 26,
    padding: 24,
    gap: 18,
    borderWidth: 1,
    borderColor: "#38564b",
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
  },
  heroTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metric: { flex: 1, minWidth: 75, gap: 6 },
  metricValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  unit: { color: colors.muted, fontSize: 12 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  section: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    gap: 8,
  },
  rail: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 5,
    overflow: "hidden",
  },
});
