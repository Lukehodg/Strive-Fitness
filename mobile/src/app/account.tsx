import { useState } from "react";
import { router } from "expo-router";
import { Screen, Heading, Field, Copy, Action, Feedback } from "../components/ui";
import { useResource } from "../lib/use-resource";
import { useSession } from "../lib/session";
import { request } from "../lib/api";

function AccountForm({account}:{account:{displayName:string;timezone:string}}) {
  const {token} = useSession();
  const [name,setName] = useState(account.displayName);
  const [timezone,setTimezone] = useState(account.timezone);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  async function save() {
    setBusy(true);setError("");
    try { await request("/api/user/me",token,"PATCH",{displayName:name.trim(),timezone:timezone.trim()});router.back(); }
    catch(err) {setError(err instanceof Error ? err.message : "Could not save settings.");}
    finally {setBusy(false);}
  }
  return <Screen><Action secondary label="Back to health" disabled={busy} onPress={()=>router.back()}/><Heading eyebrow="YOUR ACCOUNT" title="Make it yours."/>
    <Field label="Your name" value={name} onChangeText={setName} maxLength={80} editable={!busy}/>
    <Field label="Timezone" value={timezone} onChangeText={setTimezone} autoCapitalize="none" maxLength={80} editable={!busy} placeholder="Europe/London"/>
    <Copy>Your timezone decides which day meals and check-ins belong to. Existing timestamps are preserved.</Copy>
    <Feedback message={error} error/><Action label={busy ? "Saving…" : "Save settings"} disabled={busy} onPress={()=>void save()}/>
  </Screen>;
}
export default function Account() {
  const account=useResource<{displayName:string;timezone:string}>("/api/auth/me");
  return account.data ? <AccountForm account={account.data}/> : <Screen><Copy>Loading your account…</Copy><Feedback message={account.error} error/><Action secondary label="Retry" onPress={()=>void account.reload()}/><Action secondary label="Back" onPress={()=>router.back()}/></Screen>;
}
