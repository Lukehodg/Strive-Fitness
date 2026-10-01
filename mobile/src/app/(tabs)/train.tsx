import { useState } from "react";
import { Alert, RefreshControl } from "react-native";
import { router } from "expo-router";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Feedback,
  Action,
  colors,
} from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request } from "../../lib/api";
import type { WorkoutSession, ExercisePerformance } from "../../lib/training";
import type { Readiness } from "../../lib/readiness";
import { CoachTodayCard } from "../../components/coach-today";
type Workout = {
  id: number;
  name: string;
  exerciseCount: number;
  duration: number;
  scheduledDay: string | null;
};
export default function Train() {
  const { token } = useSession();
  const templates = useResource<Workout[]>("/api/users/me/workout-templates");
  const sessions = useResource<WorkoutSession[]>("/api/training/sessions");
  const readiness = useResource<Readiness>("/api/readiness");
  const records = useResource<ExercisePerformance[]>("/api/training/records");
  const [showRecords, setShowRecords] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  async function start(id: number, lighter = false) {
    setBusy(id);
    setError("");
    try {
      const session = await request<WorkoutSession>(
        `/api/training/templates/${id}/start`,
        token,
        "POST",
        { lighter },
      );
      router.push(`/workouts/session/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start workout.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={templates.loading || sessions.loading}
          onRefresh={() => {
            void templates.reload();
            void sessions.reload();
            void readiness.reload();
            void records.reload();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Heading
        eyebrow="TRAIN WITH INTENTION"
        title="Your training."
        subtitle="Build your plan. Record the work. See your progress."
      />
      <CoachTodayCard showPlanLink={false} />
      <Action label="Your dated plan" onPress={() => router.push("/workouts/plan")} />
      {!!templates.data?.length && <Card>
        <Copy strong>Your recurring plan</Copy>
        {(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).map((day) => <Copy key={day}>{day} · {templates.data!.filter((workout) => workout.scheduledDay === day).map((workout) => workout.name).join(", ") || "No workout scheduled"}</Copy>)}
        <Copy>These are your saved weekly targets. Completed work appears in session history below.</Copy>
      </Card>}
      <Action
        label="Create a workout"
        onPress={() => router.push("/workouts/create")}
      />
      <Action secondary label={showRecords ? "Hide personal records" : "Personal records"} onPress={() => setShowRecords(!showRecords)} />
      {showRecords && <Card>
        <Copy strong>Your personal records</Copy>
        <Copy>Completed workouts only. First sessions establish baselines. Ties are not new PRs. Compare the same exercise, equipment and load convention.</Copy>
        <Feedback message={records.error} error />
        {records.data?.length === 0 && <Copy>Finish your first workout to establish your baselines.</Copy>}
        {records.data?.map(record => <Card key={record.exerciseId}>
          <Copy strong>{record.name}</Copy>
          <Copy>{record.heaviest} kg heaviest · {record.bestSetVolume} kg × reps best single set</Copy>
          {!!record.bestReps && <Copy>{record.bestReps} bodyweight reps</Copy>}
          <Copy>{record.sessionCount} completed sessions</Copy>
        </Card>)}
      </Card>}
      <Feedback message={error || templates.error || sessions.error} error />
      {readiness.data && (
        <Card>
          <Copy strong>{readiness.data.title}</Copy>
          <Copy>{readiness.data.reasons[0]}</Copy>
        </Card>
      )}
      {sessions.data
        ?.filter((item) => !item.isCompleted && item.planSnapshot)
        .map((item) => (
          <Card key={item.id}>
            <Copy strong>{item.planSnapshot!.name}</Copy>
            <Copy>
              In progress · {new Date(item.startTime).toLocaleDateString()}
            </Copy>
            <Action
              label="Resume session"
              onPress={() => router.push(`/workouts/session/${item.id}`)}
            />
          </Card>
        ))}
      <Copy strong>Your workouts</Copy>
      {templates.data?.map((workout) => (
        <Card key={workout.id}>
          <Copy strong>{workout.name}</Copy>
          <Action secondary label="Edit workout" onPress={() => router.push({ pathname: "/workouts/create", params: { templateId: workout.id } })} />
          <Copy>
            {workout.exerciseCount} exercises · {workout.duration} min
            {workout.scheduledDay ? ` · ${workout.scheduledDay}` : ""}
          </Copy>
          <Action
            label={busy === workout.id ? "Starting…" : "Start workout"}
            disabled={busy !== null}
            onPress={() => {
              void start(workout.id);
            }}
          />
          {readiness.data?.canReduceSets && (
            <Action
              secondary
              label="Start a lighter version"
              disabled={busy !== null}
              onPress={() =>
                Alert.alert(
                  "Use fewer sets today?",
                  "Use 75% of each exercise's sets, rounded down with a minimum of one. Rep and rest targets stay the same. Your saved template stays unchanged; an existing session resumes as it is.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Start lighter",
                      onPress: () => {
                        void start(workout.id, true);
                      },
                    },
                  ],
                )
              }
            />
          )}
        </Card>
      ))}
      {templates.data?.length === 0 && (
        <Copy>No workouts yet. Create your first strength session above.</Copy>
      )}
      <Copy strong>Recent sessions</Copy>
      {sessions.data
        ?.filter((item) => item.isCompleted && item.planSnapshot)
        .slice(0, 20)
        .map((item) => (
          <Card key={item.id}>
            <Copy strong>{item.planSnapshot!.name}</Copy>
            <Copy>{new Date(item.startTime).toLocaleDateString()}</Copy>
            <Action
              secondary
              label="View session"
              onPress={() => router.push(`/workouts/session/${item.id}`)}
            />
          </Card>
        ))}
      <Copy>
        Guidance uses your latest saved check-in and available device readings.
        You choose whether to adjust a session.
      </Copy>
    </Screen>
  );
}
