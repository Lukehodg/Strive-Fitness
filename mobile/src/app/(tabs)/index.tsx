import { useState } from "react";
import { RefreshControl, View, Switch, Text } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Action,
  Feedback,
  colors,
  styles,
} from "../../components/ui";
import { useSession } from "../../lib/session";
import { useResource } from "../../lib/use-resource";
import { request } from "../../lib/api";
import { CoachTodayCard } from "../../components/coach-today";
type CheckIn = {
  energy: "low" | "usual" | "high";
  soreness: "none" | "some" | "high";
  limited: boolean;
};
type Stats = {
  caloriesConsumed: number;
  proteinConsumed: number;
  carbsConsumed: number;
  fatConsumed: number;
};
export default function Today() {
  const { user, token } = useSession();
  const stats = useResource<Stats>("/api/users/me/daily-stats");
  const checkin = useResource<CheckIn | null>("/api/check-in");
  const [coachRevision, setCoachRevision] = useState(0);
  const [draft, setForm] = useState<CheckIn | null>(null);
  const form = draft ??
    checkin.data ?? {
      energy: "usual",
      soreness: "none",
      limited: false,
    };
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await request("/api/check-in", token, "POST", {
        energy: form.energy,
        soreness: form.soreness,
        limited: form.limited,
      });
      setError(false);
      setMessage("Your check-in is saved.");
      await checkin.reload();
      setForm(null);
      setCoachRevision((value) => value + 1);
    } catch (err) {
      setError(true);
      setMessage(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={stats.loading || checkin.loading}
          onRefresh={() => {
            void stats.reload();
            void checkin.reload();
            setCoachRevision((value) => value + 1);
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Heading
        eyebrow={new Intl.DateTimeFormat("en-GB", {
          timeZone: user?.timezone,
          weekday: "long",
          day: "numeric",
          month: "short",
        })
          .format(new Date())
          .toUpperCase()}
        title={`Your day, ${user?.displayName.split(" ")[0]}.`}
        subtitle="A little more intention. A stronger everyday."
      />
      <CoachTodayCard key={coachRevision} disabled={busy || draft !== null || checkin.loading || !!checkin.error} />
      <Card>
        <Copy strong>How are you feeling?</Copy>
        <Copy>Energy</Copy>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["low", "usual", "high"] as const).map((value) => (
            <View key={value} style={{ flex: 1 }}>
              <Action
                label={value}
                secondary={form.energy !== value}
                disabled={busy || checkin.loading || !!checkin.error}
                onPress={() => {
                  setForm({ ...form, energy: value });
                  setMessage("");
                }}
              />
            </View>
          ))}
        </View>
        <Copy>Soreness</Copy>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["none", "some", "high"] as const).map((value) => (
            <View key={value} style={{ flex: 1 }}>
              <Action
                label={value}
                secondary={form.soreness !== value}
                disabled={busy || checkin.loading || !!checkin.error}
                onPress={() => {
                  setForm({ ...form, soreness: value });
                  setMessage("");
                }}
              />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={[styles.body, { flex: 1 }]}>
            Illness, pain or injury is limiting me today
          </Text>
          <Switch
            accessibilityLabel="Illness, pain or injury is limiting me today"
            disabled={busy || checkin.loading || !!checkin.error}
            value={form.limited}
            onValueChange={(limited) => {
              setForm({ ...form, limited });
              setMessage("");
            }}
            trackColor={{ true: colors.accent }}
          />
        </View>
        <Feedback message={checkin.error} error />
        <Feedback message={message} error={error} />
        <Action
          label={busy ? "Saving…" : "Save check-in"}
          disabled={busy || checkin.loading || !!checkin.error}
          onPress={() => {
            void save();
          }}
        />
        <Copy>
          Saved check-ins inform your coach preview. You review and accept any changes before starting.
        </Copy>
      </Card>
      <Card>
        <Copy strong>Nutrition today</Copy>
        <Feedback message={stats.error} error />
        {stats.data ? (
          <>
            <Text style={styles.title}>{stats.data.caloriesConsumed} kcal</Text>
            <Copy>
              Protein {stats.data.proteinConsumed}g · Carbs{" "}
              {stats.data.carbsConsumed}g · Fat {stats.data.fatConsumed}g
            </Copy>
          </>
        ) : (
          <Copy>
            {stats.loading ? "Loading nutrition…" : "Pull down to retry."}
          </Copy>
        )}
        <Action
          secondary
          label="Open food log"
          onPress={() => router.navigate("/food")}
        />
      </Card>
    </Screen>
  );
}
