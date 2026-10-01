import { Text, View } from "react-native";
import { design } from "./dashboard";
import { useRef, useState } from "react";
import { router } from "expo-router";
import * as Crypto from "expo-crypto";
import { Card, Copy, Action, Feedback, colors } from "./ui";
import { useResource } from "../lib/use-resource";
import { useSession } from "../lib/session";
import { request } from "../lib/api";
import type { CoachToday, CoachRecommendation } from "../lib/coach";

export function CoachTodayCard({
  disabled = false,
  showPlanLink = true,
  featured = false,
}: {
  disabled?: boolean;
  showPlanLink?: boolean;
  featured?: boolean;
}) {
  const resource = useResource<CoachToday>("/api/coach/today", 60000);
  const { token } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{
    templateId: number;
    scheduledId?: number;
    requestKey: string;
  } | null>(null);
  const locked = useRef(false);
  const data = resource.data;
  async function preview(templateId: number, scheduledId?: number) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    if (
      pending.current?.templateId !== templateId ||
      pending.current?.scheduledId !== scheduledId
    )
      pending.current = {
        templateId,
        ...(scheduledId ? { scheduledId } : {}),
        requestKey: Crypto.randomUUID(),
      };
    try {
      const result = await request<CoachRecommendation>(
        "/api/coach/recommendations",
        token,
        "POST",
        pending.current,
      );
      pending.current = null;
      router.push(`/coach/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build preview.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  if (featured) {
    const active = data?.activeSessions[0];
    const scheduled = data?.scheduledWorkouts.find((w) => !w.sessionId);
    const template =
      data?.templates.find((t) => t.id === active?.templateId) ||
      data?.templates.find((t) => t.id === scheduled?.templateId) ||
      data?.templates.find((t) => data.scheduledTemplateIds.includes(t.id));
    const recommendation = data?.recommendation;
    return (
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 18,
          padding: 18,
          gap: 12,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={design.eyebrow}>
          {active ? "PICK UP WHERE YOU LEFT OFF" : "YOUR NEXT SESSION"}
        </Text>
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 23, fontWeight: "600" }}
        >
          {active
            ? template?.name || "Workout in progress"
            : scheduled?.name || template?.name || "Choose today’s session"}
        </Text>
        <Feedback message={error || resource.error} error />
        {!data && (
          <Copy>
            {resource.loading
              ? "Loading your training plan..."
              : "Your plan is unavailable. Pull down to retry."}
          </Copy>
        )}
        {active ? (
          <Action
            label="Resume workout"
            onPress={() => router.push(`/workouts/session/${active.id}`)}
          />
        ) : (
          <>
            <Copy>
              {scheduled || template
                ? "Your saved programme, with today’s recovery guidance."
                : data?.templates.length
                  ? "Choose a workout from your library to train today."
                  : "Build your first workout and make it yours."}
            </Copy>
            {disabled && (
              <Copy>
                Save your check-in below before reviewing your session.
              </Copy>
            )}
            <Action
              label={
                busy
                  ? "Preparing..."
                  : scheduled || template
                    ? "Review & start workout"
                    : data?.templates.length
                      ? "Choose a workout"
                      : "Create a workout"
              }
              disabled={
                disabled || busy || resource.loading || !!resource.error
              }
              onPress={() => {
                if (scheduled || template)
                  void preview(
                    scheduled?.templateId || template!.id,
                    scheduled?.id,
                  );
                else
                  router.push(
                    data?.templates.length ? "/train" : "/workouts/create",
                  );
              }}
            />
          </>
        )}
        {recommendation && !recommendation.stale && (
          <Action
            secondary
            label="Why this workout?"
            disabled={disabled}
            onPress={() => router.push(`/coach/${recommendation.id}`)}
          />
        )}
        <Action
          secondary
          label="View training plan"
          onPress={() => router.push("/workouts/plan")}
        />
      </View>
    );
  }
  return (
    <Card>
      <Copy strong>Your coach</Copy>
      <Feedback message={error || resource.error} error />
      {disabled && (
        <Copy>Save your check-in below before reviewing a workout.</Copy>
      )}
      {!data && (
        <Copy>
          {resource.loading
            ? "Loading your planâ€¦"
            : "Your plan could not be loaded."}
        </Copy>
      )}
      {data?.activeSessions.map((session) => (
        <Action
          key={session.id}
          label="Resume active workout"
          onPress={() => router.push(`/workouts/session/${session.id}`)}
        />
      ))}
      {data?.recommendation && (
        <>
          <Copy strong>{data.recommendation.original.name}</Copy>
          <Copy>
            {data.recommendation.stale
              ? "Your inputs changed. Review an updated preview."
              : data.recommendation.decision
                ? "Your workout choice is saved."
                : data.recommendation.reasons[0]?.text}
          </Copy>
          <Action
            secondary
            disabled={disabled}
            label="Review workout Â· Why this?"
            onPress={() => router.push(`/coach/${data.recommendation!.id}`)}
          />
        </>
      )}
      {!!data?.templates.length && (
        <Copy>
          Choose a workout to review
          {data.scheduledTemplateIds.length
            ? " Â· today's scheduled workouts are marked"
            : ""}
          .
        </Copy>
      )}
      {data?.scheduledWorkouts.map((workout) => (
        <Action
          key={`scheduled-${workout.id}`}
          secondary
          label={`${workout.sessionId ? "Open session" : "Today"} Â· ${workout.name}`}
          disabled={disabled || busy || resource.loading || !!resource.error}
          onPress={() => {
            if (workout.sessionId)
              router.push(`/workouts/session/${workout.sessionId}`);
            else void preview(workout.templateId, workout.id);
          }}
        />
      ))}
      {data?.templates
        .filter(
          (t) => !data.scheduledWorkouts.some((w) => w.templateId === t.id),
        )
        .map((template) => (
          <Action
            key={template.id}
            secondary
            label={`${data.scheduledTemplateIds.includes(template.id) ? "Today Â· " : ""}${template.name}`}
            disabled={disabled || busy || resource.loading || !!resource.error}
            onPress={() => {
              void preview(template.id);
            }}
          />
        ))}
      {data?.templates.length === 0 && (
        <>
          <Copy>
            Create a workout first, then Strive can adapt its targets.
          </Copy>
          <Action
            label="Create a workout"
            onPress={() => router.push("/workouts/create")}
          />
        </>
      )}
      {showPlanLink && (
        <Action
          secondary
          label="Your plan"
          onPress={() => router.push("/workouts/plan")}
        />
      )}
      {resource.error && (
        <Action
          secondary
          label="Retry"
          onPress={() => {
            void resource.reload();
          }}
        />
      )}
    </Card>
  );
}
