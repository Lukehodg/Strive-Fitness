import { useEffect, useState } from "react";
import { SessionFeedbackCard } from "../../../components/session-feedback";
import { Alert, RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Field,
  Action,
  Feedback,
  colors,
} from "../../../components/ui";
import { useResource } from "../../../lib/use-resource";
import { useSession } from "../../../lib/session";
import { request } from "../../../lib/api";
import type {
  SessionDetail,
  LoggedSet,
  PlanExercise,
} from "../../../lib/training";
function SetRow({
  exercise,
  number,
  saved,
  disabled,
  onSave,
}: {
  exercise: PlanExercise;
  number: number;
  saved?: LoggedSet;
  disabled: boolean;
  onSave: (values: {
    exerciseId: number;
    setNumber: number;
    weight: number;
    reps: number;
    rpe: number | null;
  }) => Promise<void>;
}) {
  const [weight, setWeight] = useState(saved?.weight?.toString() || "");
  const [reps, setReps] = useState(saved?.reps?.toString() || "");
  const [rpe, setRpe] = useState(saved?.rpe?.toString() || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setError("");
    setBusy(true);
    try {
      const load = Number(weight),
        count = Number(reps),
        effort = rpe.trim() ? Number(rpe) : null;
      if (
        !weight.trim() ||
        !Number.isFinite(load) ||
        load < 0 ||
        load > 1500 ||
        !reps.trim() ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 200 ||
        (effort !== null &&
          (!Number.isInteger(effort) || effort < 1 || effort > 10))
      )
        throw new Error(
          "Enter weight (0 for bodyweight), reps (1–200), and optional RPE (1–10).",
        );
      await onSave({
        exerciseId: exercise.exerciseId,
        setNumber: number,
        weight: load,
        reps: count,
        rpe: effort,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save set.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View
      style={{
        gap: 10,
        borderTopWidth: 1,
        borderColor: colors.border,
        paddingTop: 14,
      }}
    >
      <Copy>
        Set {number}
        {saved ? " · Saved" : ""}
      </Copy>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Weight (kg)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            editable={!disabled && !busy}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Reps"
            value={reps}
            onChangeText={setReps}
            keyboardType="number-pad"
            editable={!disabled && !busy}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="RPE (optional)"
            value={rpe}
            onChangeText={setRpe}
            keyboardType="number-pad"
            editable={!disabled && !busy}
          />
        </View>
      </View>
      <Feedback message={error} error />
      {!disabled && (
        <Action
          secondary
          label={busy ? "Saving…" : saved ? "Update set" : "Save set"}
          disabled={busy}
          onPress={() => {
            void save();
          }}
        />
      )}
    </View>
  );
}
export default function Session() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const resource = useResource<SessionDetail>(`/api/training/sessions/${id}`);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restUntil, setRestUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const rest = Math.max(0, Math.ceil((restUntil - now) / 1000));
  const detail = resource.data;
  async function saveSet(
    values: Parameters<typeof SetRow>[0]["onSave"] extends (
      values: infer V,
    ) => Promise<void>
      ? V
      : never,
  ) {
    setSaving(true);
    try {
      await request(`/api/training/sessions/${id}/sets`, token, "PUT", values);
      setRestUntil(Date.now() + (detail?.workout.planSnapshot?.exercises.find(e => e.exerciseId === values.exerciseId)?.restSeconds || 0) * 1000);
      await resource.reload();
    } finally {
      setSaving(false);
    }
  }
  async function finish() {
    setFinishing(true);
    setError("");
    try {
      await request(`/api/training/sessions/${id}/finish`, token, "POST");
      await resource.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish.");
    } finally {
      setFinishing(false);
    }
  }
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={resource.loading}
          onRefresh={() => {
            void resource.reload();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Action
        secondary
        label="Back to training"
        onPress={() => router.replace("/train")}
      />
      <Heading
        eyebrow={
          detail?.workout.isCompleted
            ? "SESSION HISTORY"
            : "YOUR ACTIVE SESSION"
        }
        title={detail?.workout.planSnapshot?.name || "Workout session"}
        subtitle={
          detail
            ? new Date(detail.workout.startTime).toLocaleString()
            : undefined
        }
      />
      <Feedback message={resource.error || error} error />
      {detail && <Card>
        <Copy strong>{detail.sets.length} sets saved · {detail.sets.reduce((n, s) => n + (s.weight || 0) * (s.reps || 0), 0)} kg × reps</Copy>
        <Copy>Log dumbbells per hand, barbells including the bar, and machines using the displayed load. Keep equipment and loading conventions consistent.</Copy>
        {!detail.workout.isCompleted && <>
          <Copy strong>Rest · {rest ? `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}` : "Ready when you are"}</Copy>
          {!!rest && <Action secondary label="Skip rest" onPress={() => setRestUntil(0)} />}
          <Copy>Records are confirmed when you finish the session.</Copy>
        </>}
      </Card>}
      {detail?.workout.planSnapshot?.coach && <Card>
        <Copy strong>Your accepted workout</Copy>
        <Copy>{detail.workout.planSnapshot.coach.choice === "original" ? "You kept the original targets." : "These targets match the coach proposal you accepted."} Later check-ins do not rewrite this session.</Copy>
        <Action secondary label="Why this workout?" onPress={() => router.push(`/coach/${detail.workout.planSnapshot!.coach!.recommendationId}`)} />
      </Card>}
      {detail?.workout.planSnapshot?.guidance && (
        <Card>
          <Copy strong>Lighter session</Copy>
          <Copy>
            Fewer sets were selected when this session started. Your original
            template is unchanged.
          </Copy>
          {detail.workout.planSnapshot.guidance.reasons.map((reason) => (
            <Copy key={reason}>{reason}</Copy>
          ))}
        </Card>
      )}
      {detail?.workout.planSnapshot?.exercises.map((exercise) => (
        <Card key={exercise.exerciseId}>
          <Copy strong>{exercise.name}</Copy>
          <Copy>{detail.performance?.find(p => p.exerciseId === exercise.exerciseId)?.previous.map(s => `${s.weight} kg × ${s.reps}`).join(" · ") ?
            `Last completed: ${detail.performance.find(p => p.exerciseId === exercise.exerciseId)!.previous.map(s => `${s.weight} kg × ${s.reps}`).join(" · ")}` :
            "No previous completed session. Establish a comfortable baseline."}</Copy>
          {detail.workout.isCompleted && detail.achievements?.find(a => a.exerciseId === exercise.exerciseId)?.achievements.map(text => <Copy key={text} strong>{text}</Copy>)}
          <Copy>
            {exercise.sets} sets · {exercise.repsMin}–{exercise.repsMax} reps ·{" "}
            {exercise.restSeconds}s rest
          </Copy>
          {Array.from({ length: exercise.sets }, (_, i) => {
            const saved = detail.sets.find(
              (item) =>
                item.exerciseId === exercise.exerciseId &&
                item.setNumber === i + 1,
            );
            return (
              <SetRow
                key={`${i}-${saved?.timestamp || "new"}`}
                exercise={exercise}
                number={i + 1}
                saved={saved}
                disabled={detail.workout.isCompleted || finishing || saving}
                onSave={saveSet}
              />
            );
          })}
        </Card>
      ))}
      {detail && !detail.workout.planSnapshot && (
        <Copy>
          This older session has no saved plan. New native sessions preserve one
          automatically.
        </Copy>
      )}
      {detail?.workout.isCompleted && <SessionFeedbackCard sessionId={detail.workout.id} />}
      {detail?.workout.isCompleted ? (
        <Card>
          <Copy strong>Session complete.</Copy>
          <Copy>
            {detail.sets.length} sets recorded. Your history is saved.
          </Copy>
        </Card>
      ) : (
        detail?.workout.planSnapshot && (
          <Action
            label={finishing ? "Finishing…" : "Finish session"}
            disabled={finishing || saving}
            onPress={() =>
              Alert.alert(
                "Finish this session?",
                `${detail.sets.length} sets are saved. Unsaved entries will not be recorded.`,
                [
                  { text: "Keep training", style: "cancel" },
                  {
                    text: "Finish",
                    onPress: () => {
                      void finish();
                    },
                  },
                ],
              )
            }
          />
        )
      )}
    </Screen>
  );
}
