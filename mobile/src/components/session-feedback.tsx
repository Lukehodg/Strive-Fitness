import { useState } from "react";
import { Card, Copy, Action, Field, Feedback } from "./ui";
import { useResource } from "../lib/use-resource";
import { useSession } from "../lib/session";
import { request } from "../lib/api";
import type { SessionFeedback } from "../../../shared/planning";

export function SessionFeedbackCard({ sessionId }: { sessionId: number }) {
  const { token } = useSession();
  const resource = useResource<SessionFeedback | null>(`/api/training/sessions/${sessionId}/feedback`);
  const [draft, setDraft] = useState<SessionFeedback | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const form = draft ?? resource.data;
  function edit(value: Partial<SessionFeedback>) { setDraft({ difficulty: form?.difficulty ?? "about_right", energyAfter: form?.energyAfter ?? null, note: form?.note ?? "", ...value }); setMessage(""); }
  return <Card><Copy strong>How did that feel?</Copy><Copy>Optional feedback helps review future workouts. It does not change your logged sets.</Copy>
    <Feedback message={resource.error} error />
    {(["too_easy", "about_right", "too_hard"] as const).map(difficulty => <Action key={difficulty} label={difficulty.replaceAll("_", " ")} secondary={form?.difficulty !== difficulty} disabled={busy || resource.loading} onPress={() => edit({ difficulty })} />)}
    <Field label="Notes (optional)" value={form?.note ?? ""} onChangeText={note => edit({ note })} maxLength={1000} editable={!busy} multiline />
    <Feedback message={message} />
    <Action label={busy ? "Saving…" : resource.data ? "Update feedback" : "Save feedback"} disabled={!form || busy || resource.loading || !!resource.error} onPress={() => {
      if (!form) return; setBusy(true); setMessage("");
      void request(`/api/training/sessions/${sessionId}/feedback`, token, "PUT", form).then(async () => { await resource.reload(); setDraft(null); setMessage("Feedback saved."); }).catch(e => setMessage(e instanceof Error ? e.message : "Unable to save.")).finally(() => setBusy(false));
    }} />
  </Card>;
}
