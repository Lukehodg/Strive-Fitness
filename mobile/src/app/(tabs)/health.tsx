import { useRef, useState } from "react";
import { Alert, RefreshControl } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Action,
  Feedback,
  colors,
} from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request } from "../../lib/api";
import type { Routine, RoutineLog } from "../../lib/routines";
export default function Health() {
  const { user, token, signOut } = useSession();
  const routines = useResource<Routine[]>("/api/users/me/medications");
  const history = useResource<RoutineLog[]>("/api/routine-logs");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<Record<string, string>>({});
  async function record(item: Routine, status: "taken" | "skipped") {
    setBusy(true);
    setMessage("");
    const action = `${item.id}-${status}`;
    const requestKey =
      pending.current[action] ?? (pending.current[action] = randomUUID());
    try {
      await request("/api/routine-logs", token, "POST", {
        medicationId: item.id,
        status,
        requestKey,
      });
      delete pending.current[action];
      setFailed(false);
      setMessage(`${item.name}: recorded as ${status}.`);
      await history.reload();
    } catch (err) {
      setFailed(true);
      setMessage(
        err instanceof Error ? err.message : "Could not record this entry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function archive(item: Routine) {
    setBusy(true);
    setMessage("");
    try {
      await request(`/api/medications/${item.id}`, token, "PATCH", {
        isActive: !item.isActive,
      });
      await routines.reload();
    } catch (err) {
      setFailed(true);
      setMessage(
        err instanceof Error ? err.message : "Could not update routine.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={routines.loading || history.loading}
          onRefresh={() => {
            void routines.reload();
            void history.reload();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Heading
        eyebrow="HEALTH & ROUTINE"
        title="Small habits. Consistent days."
        subtitle="Track your existing supplements, peptides and medication."
      />
      <Action
        label="Add a routine"
        onPress={() => router.push("/routine/edit")}
      />
      <Feedback message={routines.error || history.error} error />
      <Feedback message={message} error={failed} />
      {routines.data
        ?.filter((item) => item.isActive)
        .map((item) => (
          <Card key={item.id}>
            <Copy strong>{item.name}</Copy>
            <Copy>
              {item.category} · {item.type}
            </Copy>
            <Copy>
              {item.dosage} · {item.frequency}
            </Copy>
            {item.notes && <Copy>{item.notes}</Copy>}
            {history.data?.find(log => log.medicationId === item.id) && <Copy>
              Last recorded: {history.data.find(log => log.medicationId === item.id)!.status} · {new Date(history.data.find(log => log.medicationId === item.id)!.recordedAt).toLocaleString()}
            </Copy>}
            <Action
              label="Record taken"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Record an existing dose?",
                  `${item.name} · ${item.dosage}\nThis records a dose you have already taken.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Record taken",
                      onPress: () => {
                        void record(item, "taken");
                      },
                    },
                  ],
                )
              }
            />
            <Action
              secondary
              label="Record skipped"
              disabled={busy}
              onPress={() =>
                Alert.alert("Record a skipped dose?", item.name, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Record skipped",
                    onPress: () => {
                      void record(item, "skipped");
                    },
                  },
                ])
              }
            />
            <Action
              secondary
              label="Edit routine"
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/routine/edit",
                  params: { id: item.id },
                })
              }
            />
            <Action
              secondary
              label="Archive routine"
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Archive this routine?",
                  "Its recorded history will be preserved.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Archive",
                      onPress: () => {
                        void archive(item);
                      },
                    },
                  ],
                )
              }
            />
          </Card>
        ))}
      {routines.data?.length === 0 && <Copy>No routines recorded yet.</Copy>}
      <Copy strong>Recent records</Copy>
      {history.data?.slice(0, 30).map((log) => (
        <Card key={log.id}>
          <Copy strong>
            {log.name} · {log.status}
          </Copy>
          <Copy>
            {log.dosage} · {new Date(log.recordedAt).toLocaleString()}
          </Copy>
        </Card>
      ))}
      {history.data?.length === 0 && (
        <Copy>No taken or skipped entries yet.</Copy>
      )}
      {routines.data
        ?.filter((item) => !item.isActive)
        .map((item) => (
          <Card key={item.id}>
            <Copy>{item.name} · Archived</Copy>
            <Action
              secondary
              label="Restore routine"
              disabled={busy}
              onPress={() => {
                void archive(item);
              }}
            />
          </Card>
        ))}
      <Card>
        <Copy strong>{user?.displayName}</Copy>
        <Copy>{user?.username}</Copy>
        <Action secondary label="Account settings" disabled={busy} onPress={() => router.push("/account")} />
        <Action
          secondary
          label="Sign out"
          disabled={busy}
          onPress={() => {
            setBusy(true);
            void signOut()
              .catch((err) => {
                setFailed(true);
                setMessage(
                  err instanceof Error ? err.message : "Could not sign out.",
                );
              })
              .finally(() => setBusy(false));
          }}
        />
      </Card>
    </Screen>
  );
}
