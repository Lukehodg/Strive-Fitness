import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type {
  HealthDay,
  HealthOverview as Overview,
  HealthSource,
} from "../../../shared/health-overview";
import { useResource } from "../lib/use-resource";
import type { Readiness } from "../lib/readiness";
import { Action, Card, Copy, Feedback, Screen, colors } from "./ui";
import { Segments } from "./dashboard";

type MetricKey = "score" | "sleepMinutes" | "hrv" | "restingHeartRate";
const keys: MetricKey[] = ["score", "sleepMinutes", "hrv", "restingHeartRate"];
const labels = {
  score: "Recovery",
  sleepMinutes: "Sleep",
  hrv: "HRV",
  restingHeartRate: "Resting heart rate",
};
function label(key: MetricKey, source: HealthSource) {
  return key === "score" ? source.scoreLabel : labels[key];
}
function amount(key: MetricKey, value: number | null | undefined) {
  if (value == null) return "—";
  if (key === "sleepMinutes") {
    const minutes = Math.round(value);
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  return String(Math.round(value * 10) / 10);
}
function unit(key: MetricKey, source: HealthSource) {
  return key === "score"
    ? source.provider === "whoop"
      ? "%"
      : "/100"
    : key === "hrv"
      ? "ms"
      : key === "restingHeartRate"
        ? "bpm"
        : "";
}
function dayLabel(day: string) {
  return new Date(day + "T12:00:00Z").toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}
function change(key: MetricKey, source: HealthSource) {
  const current = source.current?.[key],
    previous = source.days.at(-2)?.[key];
  if (current == null) return "No current reading";
  if (previous == null) return "No reading yesterday";
  const delta = Math.round((current - previous) * 10) / 10;
  if (!delta) return "Same as yesterday";
  const suffix =
    key === "score"
      ? "points"
      : key === "sleepMinutes"
        ? "min"
        : unit(key, source);
  return `${delta > 0 ? "+" : ""}${delta} ${suffix} vs yesterday`;
}
function Trend({
  days,
  metric,
  detailed = false,
}: {
  days: HealthDay[];
  metric: MetricKey;
  detailed?: boolean;
}) {
  const values = days.map((d) => d[metric]);
  const max = Math.max(1, ...values.filter((v): v is number => v !== null));
  return (
    <View style={[s.trend, { height: detailed ? 110 : 25 }]} accessible={false}>
      {days.map((d, i) => (
        <View
          key={d.day}
          style={{
            flex: 1,
            height: "100%",
            justifyContent: "flex-end",
            gap: 5,
          }}
        >
          <View
            style={{
              height:
                values[i] === null
                  ? 2
                  : Math.max(2, (values[i]! / max) * (detailed ? 85 : 23)),
              backgroundColor:
                values[i] === null
                  ? colors.border
                  : i === days.length - 1
                    ? colors.accent
                    : colors.muted,
              borderRadius: 3,
              opacity: values[i] === null ? 0.4 : 1,
            }}
          />
          {detailed && (
            <Text style={[s.caption, { textAlign: "center" }]}>
              {Number(d.day.slice(-2))}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
export function HealthOverview() {
  const overview = useResource<Overview>("/api/health-overview", 60000);
  const readiness = useResource<Readiness>("/api/readiness", 60000);
  const [provider, setProvider] = useState("whoop");
  const [selected, setSelected] = useState<MetricKey | null>(null);
  const sources = overview.error ? [] : overview.data?.sources || [];
  const source = sources.find((s) => s.provider === provider) || sources[0];
  const days = source?.days.slice(-7) || [];
  const unavailable =
    source && !source.fresh
      ? source.status === "reconnect_required"
        ? "Reconnect to update your readings."
        : "Sync needs updating. History is available; current readings are hidden."
      : source && !source.current
        ? "No readings for today yet. Sync after your wearable has processed your sleep."
        : null;
  return (
    <View style={{ gap: 14 }}>
      <Feedback message={overview.error} error />
      {sources.length > 1 && (
        <Segments
          options={sources.map((s) => s.label)}
          value={source.label}
          onChange={(v) =>
            setProvider(sources.find((s) => s.label === v)!.provider)
          }
        />
      )}
      {source ? (
        <>
          <Text style={s.caption}>
            {source.label} · {dayLabel(overview.data!.day)}
            {source.lastSync
              ? ` · Synced ${new Date(source.lastSync).toLocaleString(undefined, { timeZone: overview.data!.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : " · Not synced"}
          </Text>
          {unavailable && (
            <View style={{ gap: 4 }}>
              <Copy>{unavailable}</Copy>
              <Action
                label="Open connections"
                secondary
                onPress={() => router.push("/connections")}
              />
            </View>
          )}
          <View style={s.grid}>
            {keys.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${source.label} ${label(key, source)}: ${amount(key, source.current?.[key])} ${source.current?.[key] != null ? unit(key, source) : ""}. Open history.`}
                onPress={() => setSelected(key)}
                style={({ pressed }) => [
                  s.metric,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text style={s.caption}>{label(key, source)}</Text>
                <Text style={s.value}>
                  {amount(key, source.current?.[key])}
                  <Text style={s.unit}>
                    {source.current?.[key] != null
                      ? ` ${unit(key, source)}`
                      : ""}
                  </Text>
                </Text>
                <Text style={s.caption}>{change(key, source)}</Text>
                <Trend days={days} metric={key} />
              </Pressable>
            ))}
          </View>
          <Text style={s.caption}>
            Bars show the past 7 days. Gaps mean no reading.
          </Text>
        </>
      ) : !overview.error ? (
        <Card>
          <Copy strong>
            {overview.loading
              ? "Loading your health overview…"
              : "Your health overview starts here"}
          </Copy>
          <Copy>
            {overview.loading
              ? "Checking your connected devices."
              : "Connect a wearable to see recovery, sleep and your own trends."}
          </Copy>
          {!overview.loading && (
            <Action
              label="Connect a wearable"
              onPress={() => router.push("/connections")}
            />
          )}
        </Card>
      ) : null}
      <Feedback message={readiness.error} error />
      {readiness.data && !readiness.error && (
        <View style={s.outlook}>
          <Text accessibilityRole="header" style={s.title}>
            {readiness.data.title}
          </Text>
          <Copy>{readiness.data.reasons[0]}</Copy>
          {sources.length > 1 && (
            <Text style={s.caption}>
              Devices stay separate. Training guidance considers both.
            </Text>
          )}
        </View>
      )}
      <Modal
        visible={selected !== null}
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <Screen>
          <Action
            secondary
            label="← Back to Today"
            onPress={() => setSelected(null)}
          />
          {selected && source ? (
            <>
              <Text style={s.caption}>
                {source.label} · {overview.data?.day}
              </Text>
              <Text accessibilityRole="header" style={s.heading}>
                {label(selected, source)}
              </Text>
              <Text style={s.large}>
                {amount(selected, source.current?.[selected])}
                <Text style={s.unit}>
                  {" "}
                  {source.current?.[selected] != null
                    ? unit(selected, source)
                    : ""}
                </Text>
              </Text>
              <Copy>{unavailable || change(selected, source)}</Copy>
              <Card>
                <Copy>
                  {selected === "score"
                    ? `${source.label}'s ${source.scoreLabel.toLowerCase()} score is one input to your training plan. Your check-in and training history also matter.`
                    : selected === "hrv"
                      ? `Compare ${source.label} HRV readings over time using the same source. HRV alone does not determine your workout.`
                      : selected === "restingHeartRate"
                        ? source.provider === "oura"
                          ? "Resting heart rate is not imported from Oura yet."
                          : "Resting heart rate from WHOOP. Older records may be empty until your next sync."
                        : "Total sleep time from your wearable. Missing nights are left blank."}
                </Copy>
              </Card>
              <Text style={s.title}>Last 7 days</Text>
              <Trend days={days} metric={selected} detailed />
              {days.map((day) => (
                <View key={day.day} style={s.historyRow}>
                  <Text style={s.caption}>{dayLabel(day.day)}</Text>
                  <Text style={s.historyValue}>
                    {amount(selected, day[selected])}{" "}
                    {day[selected] !== null ? unit(selected, source) : ""}
                  </Text>
                </View>
              ))}
              <Text style={s.caption}>
                Historical readings can remain visible when a sync is overdue.
                They are not a current recovery assessment.
              </Text>
            </>
          ) : (
            <Copy>No readings available.</Copy>
          )}
        </Screen>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 130,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 15,
    gap: 5,
  },
  value: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -0.7,
  },
  unit: { color: colors.muted, fontSize: 14, fontWeight: "400" },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  title: { color: colors.text, fontSize: 18, fontWeight: "600" },
  trend: { flexDirection: "row", gap: 5, alignItems: "flex-end", marginTop: 8 },
  outlook: {
    paddingBottom: 18,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 8,
  },
  heading: { color: colors.text, fontSize: 28, fontWeight: "600" },
  large: { color: colors.text, fontSize: 42, fontWeight: "600" },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  historyValue: { color: colors.text, fontSize: 15 },
});
