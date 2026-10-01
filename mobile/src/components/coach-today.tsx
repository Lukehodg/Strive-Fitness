import { useRef, useState } from "react";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { Card, Copy, Action, Feedback } from "./ui";
import { useResource } from "../lib/use-resource";
import { useSession } from "../lib/session";
import { request } from "../lib/api";
import type { CoachToday, CoachRecommendation } from "../lib/coach";

export function CoachTodayCard({ disabled = false, showPlanLink = true }: { disabled?: boolean; showPlanLink?: boolean }) {
  const resource = useResource<CoachToday>("/api/coach/today", 60000);
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ templateId: number; scheduledId?: number; requestKey: string } | null>(null);
  const locked = useRef(false);
  const data = resource.data;
  async function preview(templateId: number, scheduledId?: number) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    if (pending.current?.templateId !== templateId || pending.current?.scheduledId !== scheduledId) pending.current = { templateId, ...(scheduledId ? { scheduledId } : {}), requestKey: Crypto.randomUUID() };
    try {
      const result = await request<CoachRecommendation>("/api/coach/recommendations", token, "POST", pending.current);
      pending.current = null;
      router.push(`/coach/${result.id}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not build preview."); }
    finally { locked.current = false; setBusy(false); }
  }
  return <Card>
    <Copy strong>Your coach</Copy>
    <Feedback message={error || resource.error} error />
    {disabled && <Copy>Save your check-in below before reviewing a workout.</Copy>}
    {!data && <Copy>{resource.loading ? "Loading your plan…" : "Your plan could not be loaded."}</Copy>}
    {data?.activeSessions.map((session) => <Action key={session.id} label="Resume active workout" onPress={() => router.push(`/workouts/session/${session.id}`)} />)}
    {data?.recommendation && <>
      <Copy strong>{data.recommendation.original.name}</Copy>
      <Copy>{data.recommendation.stale ? "Your inputs changed. Review an updated preview." : data.recommendation.decision ? "Your workout choice is saved." : data.recommendation.reasons[0]?.text}</Copy>
      <Action secondary disabled={disabled} label="Review workout · Why this?" onPress={() => router.push(`/coach/${data.recommendation!.id}`)} />
    </>}
    {!!data?.templates.length && <Copy>Choose a workout to review{data.scheduledTemplateIds.length ? " · today's scheduled workouts are marked" : ""}.</Copy>}
    {data?.scheduledWorkouts.map((workout) => <Action key={`scheduled-${workout.id}`} secondary label={`${workout.sessionId ? "Open session" : "Today"} · ${workout.name}`} disabled={disabled || busy || resource.loading || !!resource.error} onPress={() => { if (workout.sessionId) router.push(`/workouts/session/${workout.sessionId}`); else void preview(workout.templateId, workout.id); }} />)}
    {data?.templates.filter(t => !data.scheduledWorkouts.some(w => w.templateId === t.id)).map((template) => <Action key={template.id} secondary label={`${data.scheduledTemplateIds.includes(template.id) ? "Today · " : ""}${template.name}`} disabled={disabled || busy || resource.loading || !!resource.error} onPress={() => { void preview(template.id); }} />)}
    {data?.templates.length === 0 && <><Copy>Create a workout first, then Strive can adapt its targets.</Copy><Action label="Create a workout" onPress={() => router.push("/workouts/create")} /></>}
    {showPlanLink && <Action secondary label="Your plan" onPress={() => router.push("/workouts/plan")} />}
    {resource.error && <Action secondary label="Retry" onPress={() => { void resource.reload(); }} />}
  </Card>;
}
