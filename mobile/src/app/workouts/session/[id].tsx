import { useEffect, useState } from "react";
import { SessionFeedbackCard } from "../../../components/session-feedback";
import {
  Alert,
  RefreshControl,
  View,
  Text,
  TextInput,
  Pressable,
} from "react-native";
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
  previous,
  disabled,
  onSave,
}: {
  exercise: PlanExercise;
  number: number;
  saved?: LoggedSet;
  previous?: { weight: number; reps: number };
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
  const [showRpe, setShowRpe] = useState(false);
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
          "Enter weight (0 for bodyweight), reps (1â€“200), and optional RPE (1â€“10).",
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
  const changed =
    !saved ||
    weight !== String(saved.weight ?? "") ||
    reps !== String(saved.reps ?? "") ||
    rpe !== String(saved.rpe ?? "");
  return (
    <View
      style={{
        gap: 8,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ width: 24, color: colors.muted, textAlign: "center" }}>
          {number}
        </Text>
        <Pressable
          disabled={disabled || busy || !previous}
          accessibilityRole="button"
          accessibilityLabel={`Copy previous set ${number}: ${previous?.weight ?? 0} kilograms, ${previous?.reps ?? 0} reps`}
          onPress={() => {
            if (previous) {
              setWeight(String(previous.weight));
              setReps(String(previous.reps));
            }
          }}
          style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
        >
          <Text
            style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}
          >
            {previous ? `${previous.weight} x ${previous.reps}` : "-"}
          </Text>
        </Pressable>
        <TextInput
          accessibilityLabel={`Set ${number} weight in kilograms`}
          value={weight}
          onChangeText={setWeight}
          placeholder="kg"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          editable={!disabled && !busy}
          style={{
            flex: 1,
            minHeight: 48,
            borderRadius: 10,
            backgroundColor: colors.background,
            color: colors.text,
            textAlign: "center",
            fontSize: 16,
          }}
        />
        <TextInput
          accessibilityLabel={`Set ${number} reps`}
          value={reps}
          onChangeText={setReps}
          placeholder="reps"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          editable={!disabled && !busy}
          style={{
            flex: 1,
            minHeight: 48,
            borderRadius: 10,
            backgroundColor: colors.background,
            color: colors.text,
            textAlign: "center",
            fontSize: 16,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            saved && !changed ? `Set ${number} saved` : `Save set ${number}`
          }
          accessibilityState={{ disabled: disabled || busy || !changed }}
          disabled={disabled || busy || !changed}
          onPress={() => void save()}
          style={{
            width: 44,
            minHeight: 48,
            borderRadius: 10,
            backgroundColor: saved && !changed ? colors.accent : colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: saved && !changed ? colors.background : colors.text,
              fontWeight: "700",
            }}
          >
            {busy ? "..." : saved && !changed ? "OK" : "+"}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowRpe(!showRpe)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {showRpe
            ? "Hide effort"
            : `Effort (RPE)${rpe ? `: ${rpe}` : " - optional"}`}
        </Text>
      </Pressable>
      {showRpe && (
        <Field
          label={`Set ${number} RPE (1-10)`}
          value={rpe}
          onChangeText={setRpe}
          keyboardType="number-pad"
          editable={!disabled && !busy}
        />
      )}
      <Feedback message={error} error />
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
      if (
        !detail?.sets.some(
          (s) =>
            s.exerciseId === values.exerciseId &&
            s.setNumber === values.setNumber,
        )
      )
        setRestUntil(
          Date.now() +
            (detail?.workout.planSnapshot?.exercises.find(
              (e) => e.exerciseId === values.exerciseId,
            )?.restSeconds || 0) *
              1000,
        );
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
      footer={
        detail && !detail.workout.isCompleted ? (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Copy strong>
                {rest
                  ? `Rest ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}`
                  : "Ready for your next set"}
              </Copy>
              {!!rest && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Skip rest"
                  onPress={() => setRestUntil(0)}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Copy>Skip</Copy>
                </Pressable>
              )}
            </View>
            <Action
              label={
                finishing
                  ? "Finishing..."
                  : `Finish workout (${detail.sets.length} sets)`
              }
              disabled={finishing || saving || !detail.workout.planSnapshot}
              onPress={() =>
                Alert.alert(
                  "Finish workout?",
                  `${detail.sets.length} sets are saved. Unsaved entries will not be recorded.`,
                  [
                    { text: "Keep training", style: "cancel" },
                    { text: "Finish", onPress: () => void finish() },
                  ],
                )
              }
            />
          </>
        ) : undefined
      }
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
      {detail && (
        <Card>
          <Copy strong>
            {detail.sets.length} sets saved Â·{" "}
            {detail.sets.reduce(
              (n, s) => n + (s.weight || 0) * (s.reps || 0),
              0,
            )}{" "}
            kg Ã— reps
          </Copy>
          <Copy>
            Log dumbbells per hand, barbells including the bar, and machines
            using the displayed load. Keep equipment and loading conventions
            consistent.
          </Copy>
          {!detail.workout.isCompleted && (
            <>
              <Copy strong>
                Rest Â·{" "}
                {rest
                  ? `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}`
                  : "Ready when you are"}
              </Copy>
              {!!rest && (
                <Action
                  secondary
                  label="Skip rest"
                  onPress={() => setRestUntil(0)}
                />
              )}
              <Copy>Records are confirmed when you finish the session.</Copy>
            </>
          )}
        </Card>
      )}
      {detail?.workout.planSnapshot?.coach && (
        <Card>
          <Copy strong>Your accepted workout</Copy>
          <Copy>
            {detail.workout.planSnapshot.coach.choice === "original"
              ? "You kept the original targets."
              : "These targets match the coach proposal you accepted."}{" "}
            Later check-ins do not rewrite this session.
          </Copy>
          <Action
            secondary
            label="Why this workout?"
            onPress={() =>
              router.push(
                `/coach/${detail.workout.planSnapshot!.coach!.recommendationId}`,
              )
            }
          />
        </Card>
      )}
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
          <Copy>
            {detail.performance
              ?.find((p) => p.exerciseId === exercise.exerciseId)
              ?.previous.map((s) => `${s.weight} kg Ã— ${s.reps}`)
              .join(" Â· ")
              ? `Last completed: ${detail.performance
                  .find((p) => p.exerciseId === exercise.exerciseId)!
                  .previous.map((s) => `${s.weight} kg Ã— ${s.reps}`)
                  .join(" Â· ")}`
              : "No previous completed session. Establish a comfortable baseline."}
          </Copy>
          {detail.workout.isCompleted &&
            detail.achievements
              ?.find((a) => a.exerciseId === exercise.exerciseId)
              ?.achievements.map((text) => (
                <Copy key={text} strong>
                  {text}
                </Copy>
              ))}
          <Copy>
            {exercise.sets} sets Â· {exercise.repsMin}â€“{exercise.repsMax} reps
            Â· {exercise.restSeconds}s rest
          </Copy>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Text style={{ width: 24, color: colors.muted, fontSize: 10 }}>
              SET
            </Text>
            {["PREVIOUS", "KG", "REPS"].map((label) => (
              <Text
                key={label}
                style={{
                  flex: 1,
                  textAlign: "center",
                  color: colors.muted,
                  fontSize: 10,
                }}
              >
                {label}
              </Text>
            ))}
            <Text
              style={{
                width: 44,
                textAlign: "center",
                color: colors.muted,
                fontSize: 10,
              }}
            >
              DONE
            </Text>
          </View>
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
                previous={detail.performance
                  ?.find((p) => p.exerciseId === exercise.exerciseId)
                  ?.previous.find((s) => s.setNumber === i + 1)}
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
      {detail?.workout.isCompleted && (
        <SessionFeedbackCard sessionId={detail.workout.id} />
      )}
      {detail?.workout.isCompleted && (
        <Card>
          <Copy strong>Session complete.</Copy>
          <Copy>
            {detail.sets.length} sets recorded. Your history is saved.
          </Copy>
        </Card>
      )}
    </Screen>
  );
}
