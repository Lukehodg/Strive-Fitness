import { useRef, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { randomUUID } from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { Screen, Heading, Card, Copy, Action, Feedback, Field } from "../components/ui";
import { useSession } from "../lib/session";
import { useResource } from "../lib/use-resource";
import { request, ApiError } from "../lib/api";
type Provider="gmail"|"outlook";
type Connection={configured:boolean;connected:boolean;address:string|null};
type Import={id:number;sender:string;subject:string;body:string;status:string};
type Outgoing={id:number;subject:string;recipient:string;status:string};
type Recent={id:string;subject:string;sender:string};
export default function Mail() {
 const {token}=useSession();
 const connections=useResource<Record<Provider,Connection>>("/api/mail/connections");
 const imports=useResource<Import[]>("/api/mail/imports");
 const outgoing=useResource<Outgoing[]>("/api/mail/outgoing");
 const [provider,setProvider]=useState<Provider>("gmail");
 const [recent,setRecent]=useState<{provider:Provider;messages:Recent[]} | null>(null);
 const [recipient,setRecipient]=useState("");const [subject,setSubject]=useState("");const [body,setBody]=useState("");
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [failed,setFailed]=useState(false);
 const pending=useRef<{requestKey:string;provider:Provider;recipient:string;subject:string;body:string;confirmed:true}|null>(null);
 async function run(fn:()=>Promise<void>) {setBusy(true);setMessage("");setFailed(false);try {await fn();}catch(err){setFailed(true);setMessage(err instanceof Error ? err.message : "Email action failed.");}finally {setBusy(false);}}
 async function connect(p:Provider) {
   const attempt=await request<{authorizationUrl:string;attemptId:string;claimToken:string}>(`/api/mail/${p}/authorize`,token,"POST");
   const result=await WebBrowser.openAuthSessionAsync(attempt.authorizationUrl,"strivefitness://mail");
   if(result.type!=="success"){setMessage("Sign-in cancelled.");return;}
   const url=new URL(result.url);
   if(url.protocol!=="strivefitness:" || url.hostname!=="mail" || url.searchParams.get("attempt")!==attempt.attemptId || url.searchParams.get("provider")!==p)throw new Error("This sign-in response did not match. Connect again.");
   if(url.searchParams.get("status")!=="ready"){setMessage("Access was not granted.");return;}
   await request(`/api/mail/${p}/complete`,token,"POST",{attemptId:attempt.attemptId,claimToken:attempt.claimToken});await connections.reload();setMessage("Mailbox connected. Choose which emails to import.");
 }
 async function send() {
   const values={provider,recipient:recipient.trim(),subject:subject.trim(),body:body.trim()};
   if(!values.recipient || !values.subject || !values.body)throw new Error("Enter a recipient, subject and message.");
   if(pending.current && ["provider","recipient","subject","body"].some(k=>pending.current![k as keyof typeof values]!==values[k as keyof typeof values]))throw new Error("A send is unconfirmed. Check the sending history before starting another message.");
   pending.current ??= {...values,requestKey:randomUUID(),confirmed:true};
   let result:Outgoing;
   try {result=await request<Outgoing>("/api/mail/send",token,"POST",pending.current);}
   catch(error) {if(error instanceof ApiError && error.status===400)pending.current=null;throw error;}
   setMessage(result.status==="accepted" ? "Accepted by your email provider. Delivery is not yet confirmed." : "Delivery outcome is uncertain. Check Sent mail before composing another message; this request will not be resent.");
   pending.current=null;setBody("");setSubject("");await outgoing.reload();
 }
 return <Screen><Action secondary label="Back to connections" disabled={busy} onPress={()=>router.back()}/><Heading eyebrow="EMAIL, WITH YOUR CONTROL" title="Connect. Review. Send." subtitle="Import selected messages as notes. Nothing changes your food, training or medication automatically."/>
 <Feedback message={connections.error || imports.error || outgoing.error || message} error={!!connections.error || !!imports.error || !!outgoing.error || failed}/>
 {(["gmail","outlook"] as const).map(p=><Card key={p}><Copy strong>{p==="gmail" ? "Gmail" : "Outlook / Microsoft 365"}</Copy><Copy>{connections.data?.[p].address || (connections.data?.[p].configured ? "Not connected" : "Server setup required")}</Copy>
 {connections.data?.[p].connected ? <><Action label="Browse latest 15 inbox messages" disabled={busy} onPress={()=>void run(async()=>{setRecent({provider:p,messages:await request<Recent[]>(`/api/mail/${p}/recent`,token)});})}/><Action secondary label="Disconnect mailbox" disabled={busy} onPress={()=>Alert.alert("Disconnect mailbox?","Remove Strive's stored credentials. Imported notes remain. Revoke the provider grant in Google or Microsoft account settings for full removal.",[{text:"Cancel",style:"cancel"},{text:"Disconnect",onPress:()=>void run(async()=>{const result=await request<{message:string}>(`/api/mail/${p}`,token,"DELETE");setRecent(null);setMessage(result.message);await connections.reload();})}])}/></> : <Action label="Connect securely" disabled={busy || !connections.data?.[p].configured} onPress={()=>void run(()=>connect(p))}/>}</Card>)}
 {recent && <Card><Copy strong>Choose messages to import · {recent.provider}</Copy>{recent.messages.length===0 && <Copy>No inbox messages returned.</Copy>}{recent.messages.map(m=><Card key={m.id}><Copy strong>{m.subject || "(No subject)"}</Copy><Copy>{m.sender}</Copy><Action secondary label="Import for review" disabled={busy} onPress={()=>void run(async()=>{await request(`/api/mail/${recent.provider}/import`,token,"POST",{messageId:m.id});await imports.reload();setMessage("Imported as plain text for review. No other records were changed.");})}/></Card>)}</Card>}
 <Copy strong>Review imported notes</Copy>{imports.data?.filter(i=>i.status!=="dismissed").map(i=><Card key={i.id}><Copy strong>{i.subject}</Copy><Copy>{i.sender} · {i.status}</Copy><Copy>{i.body}</Copy>{i.status==="pending" && <><Action label="Keep as a note" disabled={busy} onPress={()=>void run(async()=>{await request(`/api/mail/imports/${i.id}`,token,"PATCH",{status:"kept"});await imports.reload();})}/><Action secondary label="Dismiss" disabled={busy} onPress={()=>void run(async()=>{await request(`/api/mail/imports/${i.id}`,token,"PATCH",{status:"dismissed"});await imports.reload();})}/></>}</Card>)}{imports.data?.length===0 && <Copy>No emails imported yet.</Copy>}
 <Card><Copy strong>Compose an email</Copy>{(["gmail","outlook"] as const).map(p=><Action key={p} label={`From ${p}`} secondary={provider!==p} disabled={busy} onPress={()=>setProvider(p)}/>)}<Copy>{connections.data?.[provider].address || "Connect this provider before sending."}</Copy>
 <Field label="Recipient" keyboardType="email-address" autoCapitalize="none" value={recipient} onChangeText={setRecipient} editable={!busy} maxLength={254}/><Field label="Subject" value={subject} onChangeText={setSubject} editable={!busy} maxLength={200}/><Field label="Message" value={body} onChangeText={setBody} multiline editable={!busy} maxLength={20000}/>
 <Action label="Review & send" disabled={busy || !connections.data?.[provider].connected} onPress={()=>Alert.alert("Send this email?",`From: ${connections.data?.[provider].address}\nTo: ${recipient}\nSubject: ${subject}\n\n${body.slice(0,1200)}${body.length>1200 ? "… (full text is in the editor)" : ""}`,[{text:"Keep editing",style:"cancel"},{text:"Send email",onPress:()=>void run(send)}])}/>
 </Card><Copy strong>Sending history</Copy>{outgoing.data?.map(o=><Card key={o.id}><Copy strong>{o.subject}</Copy><Copy>To {o.recipient}</Copy><Copy>{o.status==="accepted" ? "Accepted by provider · not delivery confirmation" : "Unconfirmed · check Sent mail before another attempt"}</Copy></Card>)}
 </Screen>;
}
