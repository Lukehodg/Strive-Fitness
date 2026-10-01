import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Field,
  Action,
  Feedback,
} from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request } from "../../lib/api";
type Exercise = {
  id: number;
  name: string;
  muscleGroup: string;
  measurementType: string | null;
};
type Selection = {
  exercise: Exercise;
  sets: string;
  repsMin: string;
  repsMax: string;
  restSeconds: string;
};
export default function CreateWorkout() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  return templateId ? <LoadEditor id={templateId} /> : <WorkoutBuilder />;
}
type EditableTemplate = { id: number; version: string; name: string; duration: number; scheduledDay: string | null;
  exercises: { exerciseId: number; name: string; sets: number; repsMin: number; repsMax: number; restSeconds: number }[] };
function LoadEditor({ id }: { id: string }) {
  const resource = useResource<EditableTemplate>(`/api/training/templates/${id}`);
  if (!resource.data) return <Screen><Copy>Loading your workout…</Copy><Feedback message={resource.error} error /><Action label="Retry" onPress={() => { void resource.reload(); }} /><Action secondary label="Back" onPress={() => router.back()} /></Screen>;
  return <WorkoutBuilder key={resource.data.version} initial={resource.data} />;
}
function WorkoutBuilder({ initial }: { initial?: EditableTemplate }) {
  const { token } = useSession();
  const catalogue = useResource<Exercise[]>("/api/exercises");
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(initial?.duration.toString() ?? "45");
  const [search, setSearch] = useState("");
  const [day, setDay] = useState<string | null>(initial?.scheduledDay ?? null);
  const [selected, setSelected] = useState<Selection[]>(initial?.exercises.map(e => ({ exercise: { id: e.exerciseId, name: e.name, muscleGroup: "", measurementType: "weight_reps" }, sets: String(e.sets), repsMin: String(e.repsMin), repsMax: String(e.repsMax), restSeconds: String(e.restSeconds) })) ?? []);
  const [requestKey] = useState(randomUUID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = (catalogue.data || [])
    .filter(
      (item) =>
        (!item.measurementType || item.measurementType === "weight_reps") &&
        !selected.some((row) => row.exercise.id === item.id) &&
        `${item.name} ${item.muscleGroup}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice(0, 15);
  function edit(
    index: number,
    key: "sets" | "repsMin" | "repsMax" | "restSeconds",
    value: string,
  ) {
    setSelected((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }
  function move(index: number, direction: number) {
    setSelected((rows) => {
      const next = [...rows];
      [next[index], next[index + direction]] = [
        next[index + direction],
        next[index],
      ];
      return next;
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!name.trim() || !selected.length)
        throw new Error("Name your workout and add at least one exercise.");
      if (
        !Number.isInteger(Number(duration)) ||
        Number(duration) < 1 ||
        Number(duration) > 240
      )
        throw new Error("Choose a duration from 1 to 240 minutes.");
      const exercises = selected.map((row) => {
        const sets = Number(row.sets),
          repsMin = Number(row.repsMin),
          repsMax = Number(row.repsMax),
          restSeconds = Number(row.restSeconds);
        if (
          ![row.sets, row.repsMin, row.repsMax, row.restSeconds].every(
            (value) => value.trim(),
          ) ||
          ![sets, repsMin, repsMax, restSeconds].every(Number.isInteger) ||
          sets < 1 ||
          sets > 20 ||
          repsMin < 1 ||
          repsMax < repsMin ||
          repsMax > 200 ||
          restSeconds < 0 ||
          restSeconds > 1800
        )
          throw new Error(
            "Check your sets (1–20), reps (1–200) and rest (0–1800 seconds).",
          );
        return {
          exerciseId: row.exercise.id,
          sets,
          repsMin,
          repsMax,
          restSeconds,
        };
      });
      await request(initial ? `/api/training/templates/${initial.id}` : "/api/training/templates", token, initial ? "PUT" : "POST", {
        ...(initial ? { version: initial.version } : { requestKey }),
        name: name.trim(),
        duration: Number(duration),
        scheduledDay: day,
        exercises,
      });
      router.replace("/train");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save workout.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Action
        secondary
        label="Back to training"
        disabled={busy}
        onPress={() => router.back()}
      />
      <Heading
        eyebrow="BUILD YOUR SESSION"
        title="Your workout. Your way."
        subtitle="Choose strength exercises, set targets and put them in order."
      />
      <Field
        label="Workout name"
        value={name}
        onChangeText={setName}
        maxLength={160}
        editable={!busy}
      />
      <Field
        label="Planned minutes"
        value={duration}
        onChangeText={setDuration}
        keyboardType="number-pad"
        editable={!busy}
      />
      <Copy strong>Weekly schedule</Copy>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[
          null,
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ].map((value) => (
          <Action
            key={value || "none"}
            label={value?.slice(0, 3) || "Any day"}
            secondary={day !== value}
            disabled={busy}
            onPress={() => setDay(value)}
          />
        ))}
      </View>
      {selected.map((row, index) => (
        <Card key={row.exercise.id}>
          <Copy strong>
            {index + 1}. {row.exercise.name}
          </Copy>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {(["sets", "repsMin", "repsMax"] as const).map((key, i) => (
              <View key={key} style={{ flex: 1 }}>
                <Field
                  label={["Sets", "Min reps", "Max reps"][i]}
                  keyboardType="number-pad"
                  value={row[key]}
                  editable={!busy}
                  onChangeText={(value) => edit(index, key, value)}
                />
              </View>
            ))}
          </View>
          <Field
            label="Rest between sets (seconds)"
            keyboardType="number-pad"
            value={row.restSeconds}
            editable={!busy}
            onChangeText={(value) => edit(index, "restSeconds", value)}
          />
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Action
              secondary
              label="Move up"
              disabled={busy || index === 0}
              onPress={() => move(index, -1)}
            />
            <Action
              secondary
              label="Move down"
              disabled={busy || index === selected.length - 1}
              onPress={() => move(index, 1)}
            />
            <Action
              secondary
              label="Remove"
              disabled={busy}
              onPress={() =>
                setSelected((rows) => rows.filter((_, i) => i !== index))
              }
            />
          </View>
        </Card>
      ))}
      <Copy strong>Add exercises</Copy>
      <Field
        label="Search exercises or muscle groups"
        value={search}
        onChangeText={setSearch}
      />
      <Feedback message={catalogue.error} error />
      {catalogue.error && (
        <Action
          secondary
          label="Retry catalogue"
          onPress={() => {
            void catalogue.reload();
          }}
        />
      )}
      {catalogue.loading && <Copy>Loading exercises…</Copy>}
      {matches.map((item) => (
        <Action
          secondary
          key={item.id}
          label={`${item.name} · ${item.muscleGroup}`}
          disabled={busy || selected.length >= 30}
          onPress={() =>
            setSelected((rows) => [
              ...rows,
              {
                exercise: item,
                sets: "3",
                repsMin: "8",
                repsMax: "12",
                restSeconds: "90",
              },
            ])
          }
        />
      ))}
      {!catalogue.loading && !matches.length && (
        <Copy>No matching exercises.</Copy>
      )}
      <Feedback message={error} error />
      <Action
        label={busy ? "Saving…" : "Save workout"}
        disabled={busy || selected.length === 0}
        onPress={() => {
          void save();
        }}
      />
    </Screen>
  );
}
