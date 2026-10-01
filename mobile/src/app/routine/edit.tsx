import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Screen,
  Heading,
  Field,
  Action,
  Feedback,
  Copy,
} from "../../components/ui";
import { request } from "../../lib/api";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import type { Routine } from "../../lib/routines";
function Form({ initial }: { initial: Routine | null }) {
  const { token } = useSession();
  const [name, setName] = useState(initial?.name || "");
  const [category, setCategory] = useState<Routine["category"]>(
    initial?.category || "supplement",
  );
  const [type, setType] = useState(initial?.type || "capsule");
  const [dosage, setDosage] = useState(initial?.dosage || "");
  const [frequency, setFrequency] = useState(initial?.frequency || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!name.trim() || !dosage.trim() || !frequency.trim())
        throw new Error("Enter a name, existing dose and schedule.");
      await request(
        initial ? `/api/medications/${initial.id}` : "/api/medications",
        token,
        initial ? "PATCH" : "POST",
        {
          name: name.trim(),
          category,
          type,
          dosage: dosage.trim(),
          frequency: frequency.trim(),
          notes: notes.trim() || null,
          ...(!initial
            ? { startDate: new Date().toISOString(), isActive: true }
            : {}),
        },
      );
      router.replace("/health");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save routine.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Action
        secondary
        label="Back to health"
        disabled={busy}
        onPress={() => router.back()}
      />
      <Heading
        eyebrow="YOUR EXISTING ROUTINE"
        title={initial ? "Edit routine." : "Add a routine."}
        subtitle="Record what you already take and the schedule you follow."
      />
      <Copy>Category</Copy>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["supplement", "peptide", "medication"] as const).map((value) => (
          <Action
            key={value}
            label={value}
            secondary={category !== value}
            disabled={busy}
            onPress={() => setCategory(value)}
          />
        ))}
      </View>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        maxLength={160}
        editable={!busy}
      />
      <Copy>Form</Copy>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {["capsule", "tablet", "powder", "liquid", "injection", "other"].map(
          (value) => (
            <Action
              key={value}
              label={value}
              secondary={type !== value}
              disabled={busy}
              onPress={() => setType(value)}
            />
          ),
        )}
      </View>
      <Field
        label="Dose, including unit"
        placeholder="As shown on your label or prescription"
        value={dosage}
        onChangeText={setDosage}
        maxLength={100}
        editable={!busy}
      />
      <Field
        label="Existing schedule"
        placeholder="For example: once daily with breakfast"
        value={frequency}
        onChangeText={setFrequency}
        maxLength={150}
        editable={!busy}
      />
      <Field
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        maxLength={2000}
        multiline
        editable={!busy}
      />
      <Copy>
        This records your regimen; it does not recommend doses. Scheduled
        reminders are not enabled yet.
      </Copy>
      <Feedback message={error} error />
      <Action
        label={busy ? "Saving…" : "Save routine"}
        disabled={busy}
        onPress={() => {
          void save();
        }}
      />
    </Screen>
  );
}
function Existing({ id }: { id: string }) {
  const { data, error, reload } = useResource<Routine>(
    `/api/medications/${id}`,
  );
  return data ? (
    <Form initial={data} />
  ) : (
    <Screen>
      <Copy>Loading routine…</Copy>
      <Feedback message={error} error />
      {error && (
        <Action
          label="Retry"
          onPress={() => {
            void reload();
          }}
        />
      )}
      <Action secondary label="Back" onPress={() => router.back()} />
    </Screen>
  );
}
export default function EditRoutine() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return id ? <Existing id={id} /> : <Form initial={null} />;
}
