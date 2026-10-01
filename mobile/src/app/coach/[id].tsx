import { useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { Screen, Heading, Card, Copy, Action, Feedback, colors } from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request } from "../../lib/api";
import type { CoachRecommendation } from "../../lib/coach";
import type { WorkoutSession } from "../../lib/training";

export default function CoachDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  const resource = useResource<CoachRecommendation>(`/api/coach/recommendations/${id}`, 60000);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(false);
  const lock = useRef(false);
  const refreshKey = useRef<string | null>(null);
  const data = resource.data;
  const plan = data?.decision?.choice === "original" ? data.original : data?.proposed;
  const disabled = busy || resource.loading || !!resource.error;
  async function act(action: "proposed" | "original" | "start" | "refresh") {
    if (!data || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      if (action === "refresh") {
        refreshKey.current ??= Crypto.randomUUID();
        const next = await request<CoachRecommendation>("/api/coach/recommendations", token, "POST", { requestKey: refreshKey.current, templateId: data.inputs.templateId, ...(data.inputs.scheduled ? { scheduledId: data.inputs.scheduled.id } : {}) });
        refreshKey.current = null;
        router.replace(`/coach/${next.id}`);
      } else if (action === "start" && data.decision) {
        const session = await request<WorkoutSession>(`/api/coach/decisions/${data.decision.id}/start`, token, "POST", {});
        router.push(`/workouts/session/${session.id}`);
      } else if (action === "proposed" || action === "original") {
        await request(`/api/coach/recommendations/${id}/decision`, token, "POST", { choice: action });
        await resource.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save your choice.");
      await resource.reload();
    } finally { lock.current = false; setBusy(false); }
  }
  return <Screen refreshControl={<RefreshControl refreshing={resource.loading} onRefresh={() => { void resource.reload(); }} tintColor={colors.accent} />}>
    <Action secondary label="Back to Today" onPress={() => router.navigate("/")} />
    <Heading eyebrow="STRIVE COACH" title={data?.original.name || "Your workout"} subtitle={data ? `Reviewed for ${data.inputs.day}` : "Loading your saved preview…"} />
    <Feedback message={error || resource.error} error />
    <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><Action label="Workout" secondary={why} onPress={() => setWhy(false)} /></View><View style={{ flex: 1 }}><Action label="Why this?" secondary={!why} onPress={() => setWhy(true)} /></View></View>
    {data && <>
      {data.stale && <Card><Copy strong>This preview needs review</Copy><Copy>Your saved inputs changed or expired. The old plan stays visible for reference.</Copy></Card>}
      {data.status !== "ready" && <Card><Copy>{data.reasons[0]?.text}</Copy><Action secondary label="Update check-in" onPress={() => router.navigate("/")} /></Card>}
      {why ? <>
        <Card><Copy strong>Why this workout?</Copy>{data.reasons.map((reason, i) => <Copy key={i}>{reason.text}</Copy>)}</Card>
        <Card><Copy strong>What changed</Copy>{data.changes.length ? data.changes.map((change) => <Copy key={change.exerciseId}>{data.original.exercises.find((e) => e.exerciseId === change.exerciseId)?.name}: {change.before} → {change.after} sets</Copy>) : <Copy>No set, rep or rest targets changed.</Copy>}{data.decision?.choice === "original" && <Copy>You chose to keep the original targets instead.</Copy>}</Card>
        <Card><Copy strong>Data used for this preview</Copy><Copy>Check-in: {data.inputs.checkIn ? `${data.inputs.checkIn.energy} energy · ${data.inputs.checkIn.soreness} soreness` : "Not saved"}</Copy>{data.inputs.readiness.sources.length === 0 && <Copy>No connected wearable readings were used.</Copy>}{data.inputs.readiness.sources.map((source) => <View key={source.provider} style={{ gap: 6 }}><Copy strong>{source.label}</Copy><Copy>{source.usable ? `Score ${source.score} · Sleep ${source.sleepMinutes === null ? "unavailable" : `${Math.round(source.sleepMinutes)} min`} · HRV ${source.hrv === null ? "unavailable" : `${Math.round(source.hrv)} ms`}` : source.unavailableReason || "Unavailable"}</Copy><Copy>Last sync: {source.lastSync ? new Date(source.lastSync).toLocaleString() : "Unknown"}</Copy></View>)}<Copy>Training guidance, not a medical assessment.</Copy></Card>
      </> : <>
        <Card><Copy>{data.decision ? `Saved choice: ${data.decision.choice === "original" ? "original workout" : "coach proposal"}.` : data.reasons[0]?.text}</Copy><Copy>Duration is not estimated yet. Rep and rest targets are shown below.</Copy></Card>
        {(plan ?? data.original).exercises.map((exercise) => <Card key={exercise.exerciseId}><Copy strong>{exercise.name}</Copy><Copy>{exercise.sets} sets · {exercise.repsMin}–{exercise.repsMax} reps · {exercise.restSeconds}s rest</Copy></Card>)}
      </>}
      {data.decision?.sessionId ? <Action label="Open saved session" onPress={() => router.push(`/workouts/session/${data.decision!.sessionId}`)} /> : !data.stale && data.status === "ready" && (data.decision ? <Action label={busy ? "Starting…" : "Start workout"} disabled={disabled} onPress={() => { void act("start"); }} /> : <><Action label={busy ? "Saving…" : "Use this workout"} disabled={disabled} onPress={() => { void act("proposed"); }} />{data.changes.length > 0 && <Action secondary label="Keep original workout" disabled={disabled} onPress={() => { void act("original"); }} />}</>)}
      {!data.decision?.sessionId && <Action secondary label="Build updated preview" disabled={disabled} onPress={() => { void act("refresh"); }} />}
    </>}
    {resource.error && <Action secondary label="Retry loading" onPress={() => { void resource.reload(); }} />}
  </Screen>;
}
