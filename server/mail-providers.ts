import { z } from "zod";
export const mailProvider = z.enum(["gmail","outlook"]);
export type MailProvider = z.infer<typeof mailProvider>;
export type MailFetch = typeof fetch;
export type MailTokens = { access:string; refresh:string; expiresAt:number };
const services = {
  gmail:{authorize:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token",scope:"https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"},
  outlook:{authorize:"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",token:"https://login.microsoftonline.com/common/oauth2/v2.0/token",scope:"offline_access User.Read Mail.Read Mail.Send"},
};
export const mailError = (message:string,status=409) => Object.assign(new Error(message),{status});
export function mailConfig(provider:MailProvider) {
  const clientId=process.env[`MAIL_${provider.toUpperCase()}_CLIENT_ID`],clientSecret=process.env[`MAIL_${provider.toUpperCase()}_CLIENT_SECRET`];
  let url:URL;try {url=new URL(process.env.PUBLIC_API_URL || "");}catch{return null;}
  if(!clientId || !clientSecret || !/^[a-f0-9]{64}$/i.test(process.env.INTEGRATION_ENCRYPTION_KEY || "") || url.protocol!=="https:" || url.pathname!=="/" || url.username || url.password || url.search || url.hash)return null;
  return {...services[provider],clientId,clientSecret,redirectUri:`${url.origin}/api/mail/${provider}/callback`};
}
export function mailClient(provider:MailProvider, fetcher:MailFetch=fetch) {
  const config=mailConfig(provider);
  if(!config)throw mailError("This email provider needs server setup before connecting.",503);
  async function json(url:string,init:RequestInit={}) {
    const response=await fetcher(url,{...init,redirect:"error",signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw mailError(response.status===401 || response.status===403 ? "Email access expired or was not granted. Reconnect your mailbox." : "The email provider could not complete this request. Try again later.",502);
    if(response.status===202 || response.status===204)return {};
    const reader=response.body?.getReader();if(!reader)return {};
    let length=0;const chunks:Uint8Array[]=[];
    while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2_000_000){await reader.cancel();throw mailError("This email is too large to import.",413);}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async function token(parameters:Record<string,string>,prior?:MailTokens):Promise<MailTokens> {
    const data=await json(config!.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config!.clientId,client_secret:config!.clientSecret,...parameters})});
    const parsed=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1).optional(),expires_in:z.number().positive(),scope:z.string().optional()}).parse(data);
    if(parsed.scope){const granted=new Set(parsed.scope.split(" ").map(v=>v.toLowerCase()));const required=provider==="gmail" ? config!.scope.split(" ") : ["User.Read","Mail.Read","Mail.Send"];if(required.some(v=>!granted.has(v.toLowerCase())))throw mailError("Grant both import and send access to connect this mailbox.",400);}
    const refresh=parsed.refresh_token || prior?.refresh;if(!refresh)throw mailError("Offline access was not granted. Reconnect your mailbox.",400);
    return {access:parsed.access_token,refresh,expiresAt:Date.now()+parsed.expires_in*1000};
  }
  const get=(url:string,access:string)=>json(url,{headers:{Authorization:`Bearer ${access}`,Prefer:'outlook.body-content-type="text"'}});
  const base=provider==="gmail" ? "https://gmail.googleapis.com/gmail/v1/users/me" : "https://graph.microsoft.com/v1.0/me";
  return {
    config,
    exchange:(code:string,verifier:string)=>token({grant_type:"authorization_code",code,code_verifier:verifier,redirect_uri:config.redirectUri}),
    refresh:(prior:MailTokens)=>token({grant_type:"refresh_token",refresh_token:prior.refresh},prior),
    async address(access:string) {const data=await get(base+(provider==="gmail" ? "/profile" : "?$select=mail,userPrincipalName"),access);return z.string().email().max(254).parse(data.emailAddress || data.mail || data.userPrincipalName);},
    async recent(access:string) {
      if(provider==="outlook") {const data=await get(base+"/mailFolders/inbox/messages?$top=15&$select=id,subject,from,receivedDateTime&$orderby=receivedDateTime%20desc",access);return (data.value || []).map((m:any)=>({id:String(m.id),subject:String(m.subject || "(No subject)").slice(0,300),sender:String(m.from?.emailAddress?.address || ""),date:m.receivedDateTime}));}
      const list=await get(base+"/messages?maxResults=15&labelIds=INBOX",access);
      return Promise.all((list.messages || []).map(async(m:any)=>{const data=await get(base+`/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,access);const header=(name:string)=>String(data.payload?.headers?.find((h:any)=>h.name.toLowerCase()===name)?.value || "").slice(0,500);return {id:String(m.id),subject:header("subject"),sender:header("from"),date:header("date")};}));
    },
    async read(access:string,id:string) {
      if(provider==="outlook") {const data=await get(base+`/messages/${encodeURIComponent(id)}?$select=subject,from,body,bodyPreview`,access);return {subject:String(data.subject || "(No subject)").slice(0,300),sender:String(data.from?.emailAddress?.address || "").slice(0,500),body:String(data.body?.contentType?.toLowerCase()==="text" ? data.body.content : data.bodyPreview || "No plain-text content available.").slice(0,20000)};}
      const data=await get(base+`/messages/${encodeURIComponent(id)}?format=full`,access);
      const header=(name:string)=>String(data.payload?.headers?.find((h:any)=>h.name.toLowerCase()===name)?.value || "");
      const plain=(part:any,depth=0):string=>depth>12 ? "" : part.mimeType==="text/plain" && part.body?.data ? Buffer.from(part.body.data,"base64url").toString("utf8") : (part.parts || []).map((p:any)=>plain(p,depth+1)).join("\n");
      return {subject:header("subject").slice(0,300),sender:header("from").slice(0,500),body:(plain(data.payload || {}) || data.snippet || "No plain-text content available.").slice(0,20000)};
    },
    async send(access:string,from:string,message:{recipient:string;subject:string;body:string}) {
      let body:unknown;
      if(provider==="gmail") {
        const mime=`From: ${from}\r\nTo: ${message.recipient}\r\nSubject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(message.body).toString("base64").match(/.{1,76}/g)?.join("\r\n") || ""}`;
        body={raw:Buffer.from(mime).toString("base64url")};
      } else body={message:{subject:message.subject,body:{contentType:"Text",content:message.body},toRecipients:[{emailAddress:{address:message.recipient}}]},saveToSentItems:true};
      await json(base+(provider==="gmail" ? "/messages/send" : "/sendMail"),{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
    },
  };
}
