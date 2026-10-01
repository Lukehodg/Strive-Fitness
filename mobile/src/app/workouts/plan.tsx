import { useRef, useState } from "react";
import { RefreshControl } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Screen, Heading, Card, Copy, Action, Feedback, Field, colors } from "../../components/ui";
import { useSession } from "../../lib/session";
import { useResource } from "../../lib/use-resource";
import { request } from "../../lib/api";
import type { TrainingWeek, ScheduledWorkout } from "../../../../shared/planning";
import type { CoachRecommendation } from "../../lib/coach";
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);

function ScheduledCard({ workout, today, busy, onEdit, onPreview }: { workout: ScheduledWorkout; today: string; busy: boolean;
  onEdit: (workout: ScheduledWorkout, input: { day?: string; skipped?: boolean }) => Promise<void>;
  onPreview: (workout: ScheduledWorkout) => Promise<void> }) {
  const [date, setDate] = useState(workout.day);
  return <Card><Copy strong>{workout.name}</Copy><Copy>{workout.day} · {workout.status.replace("_", " ")} · {workout.timezone}</Copy>
    {workout.sessionId ? <Action label={workout.status === "completed" ? "View completed session" : "Resume session"} onPress={() => router.push(`/workouts/session/${workout.sessionId}`)} /> : <>
      {workout.day === today && workout.status === "planned" && <Action label="Review today's workout" disabled={busy} onPress={() => { void onPreview(workout); }} />}
      <Field label="Move to date (YYYY-MM-DD)" value={date} onChangeText={setDate} editable={!busy} autoCapitalize="none" />
      <Action secondary label="Reschedule" disabled={busy || date === workout.day} onPress={() => { void onEdit(workout, { day: date, skipped: false }); }} />
      <Action secondary label={workout.status === "skipped" ? "Restore workout" : "Skip workout"} disabled={busy} onPress={() => { void onEdit(workout, { skipped: workout.status !== "skipped" }); }} />
    </>}
  </Card>;
}
export default function Plan() {
  const { user, token } = useSession();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user?.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [start, setStart] = useState(today);
  const resource = useResource<TrainingWeek>(`/api/planning/week?start=${start}`, 60000);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const pending = useRef<{ scheduledId: number; templateId: number; requestKey: string } | null>(null);
  const lock = useRef(false);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try { await fn(); await resource.reload(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to update plan."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Screen refreshControl={<RefreshControl refreshing={resource.loading} onRefresh={() => { void resource.reload(); }} tintColor={colors.accent} />}>
    <Action secondary label="Back to training" onPress={() => router.navigate("/train")} />
    <Heading eyebrow="YOUR PLAN" title="One week at a time." subtitle={`${start} to ${addDays(start, 6)}`} />
    <Feedback message={error || resource.error} error /><Feedback message={message} />
    <Action secondary label="Previous week" disabled={busy} onPress={() => setStart(addDays(start, -7))} />
    <Action secondary label="Next week" disabled={busy} onPress={() => setStart(addDays(start, 7))} />
    <Action label="Plan four weeks from today" disabled={busy} onPress={() => { void run(async () => {
      const result = await request<{ added: number }>("/api/planning/build", token, "POST", { start: today, weeks: 4 });
      setMessage(`${result.added} workouts added from your saved weekly schedule. Existing dates and changes are preserved.`); setStart(today);
    }); }} />
    {!resource.data?.workouts.length && !resource.loading && <Copy>No dated workouts in this week. Assign weekdays to your workouts and build a plan.</Copy>}
    {resource.data?.workouts.map((w) => <ScheduledCard key={`${w.id}:${w.revision}`} workout={w} today={resource.data!.today} busy={busy || resource.loading || !!resource.error}
      onEdit={(workout, input) => run(async () => { await request(`/api/planning/workouts/${workout.id}`, token, "PATCH", { ...input, revision: workout.revision }); })}
      onPreview={(workout) => run(async () => {
        if (pending.current?.scheduledId !== workout.id) pending.current = { scheduledId: workout.id, templateId: workout.templateId, requestKey: randomUUID() };
        const next = await request<CoachRecommendation>("/api/coach/recommendations", token, "POST", pending.current);
        pending.current = null; router.push(`/coach/${next.id}`);
      })} />)}
  </Screen>;
}
