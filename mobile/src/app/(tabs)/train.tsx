import {
  Segments,
  Metric,
  SectionTitle,
  design,
} from "../../components/dashboard";
import { useState } from "react";
import { Alert, RefreshControl, View, Text } from "react-native";
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
  const [tab, setTab] = useState<"Workouts" | "History" | "Records">(
    "Workouts",
  );
  const showRecords = tab === "Records";
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
      scrollKey={tab}
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
      <View style={design.hero}>
        <Text style={design.eyebrow}>BUILT ONE SESSION AT A TIME</Text>
        <Text style={design.heroTitle}>Make today count.</Text>
        <View style={design.metrics}>
          <Metric
            label="Workouts saved"
            value={templates.data?.length ?? "-"}
          />
          <Metric
            label="Sessions complete"
            value={sessions.data?.filter((s) => s.isCompleted).length ?? "-"}
          />
        </View>
        <Action
          label="Create a workout"
          onPress={() => router.push("/workouts/create")}
        />
        <Action
          secondary
          label="Open training calendar"
          onPress={() => router.push("/workouts/plan")}
        />
      </View>
      <Segments
        options={["Workouts", "History", "Records"] as const}
        value={tab}
        onChange={setTab}
      />
      {tab === "Workouts" && (
        <>
          <SectionTitle
            title="Today's guidance"
            detail="Adapt to your recovery"
          />
          <CoachTodayCard showPlanLink={false} />
        </>
      )}
      {showRecords && (
        <Card>
          <Copy strong>Your personal records</Copy>
          <Copy>
            Completed workouts only. First sessions establish baselines. Ties
            are not new PRs. Compare the same exercise, equipment and load
            convention.
          </Copy>
          <Feedback message={records.error} error />
          {records.data?.length === 0 && (
            <Copy>Finish your first workout to establish your baselines.</Copy>
          )}
          {records.data?.map((record) => (
            <Card key={record.exerciseId}>
              <Copy strong>{record.name}</Copy>
              <Copy>
                {record.heaviest} kg heaviest · {record.bestSetVolume} kg × reps
                best single set
              </Copy>
              {!!record.bestReps && (
                <Copy>{record.bestReps} bodyweight reps</Copy>
              )}
              <Copy>{record.sessionCount} completed sessions</Copy>
            </Card>
          ))}
        </Card>
      )}
      <Feedback message={error || templates.error || sessions.error} error />
      {tab === "Workouts" && readiness.data && (
        <Card>
          <Copy strong>{readiness.data.title}</Copy>
          <Copy>{readiness.data.reasons[0]}</Copy>
        </Card>
      )}
      {tab === "Workouts" &&
        sessions.data
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
      {tab === "Workouts" && (
        <SectionTitle title="Workout library" detail="Your saved sessions" />
      )}
      {tab === "Workouts" &&
        templates.data?.map((workout) => (
          <Card key={workout.id}>
            <Copy strong>{workout.name}</Copy>
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
            <Action
              secondary
              label="Edit exercises & schedule"
              onPress={() =>
                router.push({
                  pathname: "/workouts/create",
                  params: { templateId: workout.id },
                })
              }
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
      {tab === "Workouts" && templates.data?.length === 0 && (
        <Copy>No workouts yet. Create your first strength session above.</Copy>
      )}
      {tab === "History" && (
        <SectionTitle title="Session history" detail="Your last 20 sessions" />
      )}
      {tab === "History" &&
        sessions.data?.filter((s) => s.isCompleted && s.planSnapshot).length ===
          0 && (
          <Card>
            <Copy strong>Your progress starts here.</Copy>
            <Copy>
              Finish a workout to see your sets, loads and personal records
              here.
            </Copy>
          </Card>
        )}
      {tab === "History" &&
        sessions.data
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
