import { HomeSummary } from "../../components/home-summary";
import { HealthOverview } from "../../components/health-overview";
import { useState } from "react";
import { RefreshControl, View, Switch, Text, Modal } from "react-native";

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
export default function Today() {
  const { user, token } = useSession();
  const checkin = useResource<CheckIn | null>("/api/check-in");
  const [coachRevision, setCoachRevision] = useState(0);
  const [checkInOpen, setCheckInOpen] = useState(false);
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
      setCheckInOpen(false);
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
          refreshing={checkin.loading}
          onRefresh={() => {
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
        title="Your health, today."
      />
      <HealthOverview key={`health-${coachRevision}`} />
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Copy strong>Today’s training</Copy>
        <Action
          secondary
          label={checkin.data ? "Check-in saved ✓" : "Check in →"}
          disabled={busy || checkin.loading}
          onPress={() => setCheckInOpen(true)}
        />
      </View>
      <Feedback message={checkin.error} error />
      {!checkInOpen && <Feedback message={message} error={error} />}
      <CoachTodayCard
        featured
        key={coachRevision}
        disabled={busy || draft !== null || checkin.loading || !!checkin.error}
      />
      <HomeSummary key={`summary-${coachRevision}`} />
      <Modal
        visible={checkInOpen}
        animationType="slide"
        onRequestClose={() => {
          if (!busy) {
            setCheckInOpen(false);
            setForm(null);
          }
        }}
      >
        <Screen>
          <Action
            secondary
            label="← Back to Today"
            disabled={busy}
            onPress={() => {
              setCheckInOpen(false);
              setForm(null);
            }}
          />
          <Heading
            eyebrow="DAILY CHECK-IN"
            title="How are you feeling?"
            subtitle="Add the context your wearable can’t measure."
          />
          <Card>
            <Copy strong>Quick check-in</Copy>
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
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
              Saved check-ins inform your coach preview. You review and accept
              any changes before starting.
            </Copy>
          </Card>
        </Screen>
      </Modal>
    </Screen>
  );
}
