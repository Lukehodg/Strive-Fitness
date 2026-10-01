import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
delete process.env.DATABASE_URL;
process.env.NODE_ENV="test";process.env.PUBLIC_API_URL="https://strive.example.test";
process.env.INTEGRATION_ENCRYPTION_KEY=randomBytes(32).toString("hex");
for(const provider of ["GMAIL","OUTLOOK"]){process.env[`MAIL_${provider}_CLIENT_ID`]='fixture-client';process.env[`MAIL_${provider}_CLIENT_SECRET`]='fixture-secret';}
await mkdir('.test-data',{recursive:true});process.env.LOCAL_DATABASE_PATH=await mkdtemp(resolve('.test-data/mail-'));
const {db,migrateDatabase,closeDatabase}=await import('../server/db');
const {createApp}=await import('../server/app');
const {mailConnections,mailAuthorizations}=await import('../shared/schema');
const {seal,unseal}=await import('../server/wearable-providers');
const {eq,and}=await import('drizzle-orm');
let base:string,server:any,alice:string,bob:string,aliceId:number;
let sends=0,failSend=false,failRead=false,refreshes=0,lastMime='';
const response=(body:unknown,status=200)=>new Response(status===202 ? null : JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const providerFetch:typeof fetch=async (input,init)=>{
 const url=new URL(String(input));
 if(url.pathname.endsWith('/token')) {const form=new URLSearchParams(String(init?.body));assert.equal(form.get('client_secret'),'fixture-secret');if(form.get('grant_type')==='refresh_token')refreshes++;else assert.ok(form.get('code_verifier'));return response({access_token:'fixture-access',refresh_token:'fixture-refresh-'+refreshes,expires_in:3600});}
 assert.ok(new Headers(init?.headers).get('Authorization')?.startsWith('Bearer fixture-access'));
 if(url.pathname.endsWith('/profile'))return response({emailAddress:'fixture@example.test'});
 if(url.pathname==='/v1.0/me')return response({mail:'fixture@example.test'});
 if(url.pathname.endsWith('/send') || url.pathname.endsWith('/sendMail')){sends++;if(url.pathname.endsWith('/send'))lastMime=Buffer.from(JSON.parse(String(init?.body)).raw,'base64url').toString('utf8');if(failSend)throw new Error('simulated timeout');return response({id:'sent'},url.pathname.endsWith('/sendMail') ? 202 : 200);}
 if(failRead)return response({},503);
 if(url.pathname.endsWith('/inbox/messages'))return response({value:[{id:'ms-1',subject:'Plan',from:{emailAddress:{address:'coach@example.test'}}}]});
 if(url.pathname.endsWith('/messages'))return response({messages:[{id:'gm-1'}]});
 if(url.pathname.endsWith('/messages/ms-1'))return response({subject:'Plan',from:{emailAddress:{address:'coach@example.test'}},body:{contentType:'text',content:'A plain-text plan. No record changes.'}});
 if(url.pathname.endsWith('/messages/gm-1'))return response({payload:{mimeType:'text/plain',headers:[{name:'Subject',value:'Plan'},{name:'From',value:'coach@example.test'}],body:{data:Buffer.from('<script>Untrusted email remains text</script>').toString('base64url')}}});
 throw new Error('Unexpected fixture provider URL');
};
async function call(path:string,method='GET',body?:unknown,cookie=alice){return fetch(base+path,{method,redirect:'manual',headers:{Cookie:cookie||'','X-Strive-Request':'1','Content-Type':'application/json'},body:body===undefined ? undefined : JSON.stringify(body)});}
async function authorize(p:string,cookie=alice){return (await call(`/api/mail/${p}/authorize`,'POST',{},cookie)).json();}
async function connect(p:string){const a=await authorize(p);const state=new URL(a.authorizationUrl).searchParams.get('state');const cb=await call(`/api/mail/${p}/callback?state=${state}&code=fixture-code`);assert.equal(cb.status,302);assert.ok(cb.headers.get('location')?.startsWith('strivefitness://mail?'));const done=await call(`/api/mail/${p}/complete`,'POST',{attemptId:a.attemptId,claimToken:a.claimToken});assert.equal(done.status,200,await done.text());return a;}
before(async()=>{await migrateDatabase();({server}=await createApp({mailFetch:providerFetch}));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;for(const name of ['alice','bob']){const res=await call('/api/auth/signup','POST',{email:`${name}@example.test`,password:'fixture-password',displayName:name},'');const cookie=res.headers.get('set-cookie')!.split(';')[0];if(name==='alice'){alice=cookie;aliceId=(await res.json()).id;}else bob=cookie;}});
after(async()=>{await new Promise<void>(r=>server.close(r));await closeDatabase();});
test('mail authorization uses PKCE, binds the account, consumes callbacks and encrypts credentials',async()=>{
 assert.equal((await call('/api/mail/connections','GET',undefined,'')).status,401);
 const a=await authorize('gmail');const url=new URL(a.authorizationUrl);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal((await call('/api/mail/gmail/callback?state=wrong-state-fixture&code=bad')).status,400);
 assert.equal((await call(`/api/mail/gmail/callback?state=${url.searchParams.get('state')}&code=fixture-code`)).status,302);
 assert.equal((await call(`/api/mail/gmail/callback?state=${url.searchParams.get('state')}&code=fixture-code`)).status,400);
 const input={attemptId:a.attemptId,claimToken:a.claimToken};assert.notEqual((await call('/api/mail/gmail/complete','POST',input,bob)).status,200);
 assert.equal((await call('/api/mail/gmail/complete','POST',input)).status,200);
 assert.equal((await call('/api/mail/gmail/complete','POST',input)).status,400);
 const [row]=await db.select().from(mailConnections).where(and(eq(mailConnections.userId,aliceId),eq(mailConnections.provider,'gmail')));assert.ok(row.tokens?.startsWith('v1.'));assert.equal(row.tokens?.includes('fixture-access'),false);
 const status=await (await call('/api/mail/connections')).json();assert.equal(status.gmail.connected,true);assert.equal(status.gmail.tokens,undefined);
 await connect('outlook');
});
test('selected Gmail and Outlook imports are deduplicated and reviewed without modifying other records',async()=>{
 for(const [p,id] of [['gmail','gm-1'],['outlook','ms-1']]){const recent=await (await call(`/api/mail/${p}/recent`)).json();assert.equal(recent[0].id,id);const first=await (await call(`/api/mail/${p}/import`,'POST',{messageId:id})).json();const retry=await (await call(`/api/mail/${p}/import`,'POST',{messageId:id})).json();assert.equal(first.id,retry.id);assert.equal(first.status,'pending');assert.equal((await call(`/api/mail/imports/${first.id}`,'PATCH',{status:'kept'},bob)).status,404);assert.equal((await call(`/api/mail/imports/${first.id}`,'PATCH',{status:'kept'})).status,200);}
 assert.deepEqual(await (await call('/api/mail/imports','GET',undefined,bob)).json(),[]);
 assert.equal((await (await call('/api/mail/imports')).json()).length,2);
});
test('sending requires explicit confirmation, prevents header injection and never repeats uncertain sends',async()=>{
 const body={provider:'gmail',requestKey:randomUUID(),recipient:'recipient@example.test',subject:'Training notes',body:'A message written by the user.',confirmed:true};
 assert.equal((await call('/api/mail/send','POST',{...body,confirmed:false})).status,400);
 assert.equal((await call('/api/mail/send','POST',{...body,subject:'Hi\r\nBcc: other@example.test'})).status,400);
 const first=await (await call('/api/mail/send','POST',body)).json();assert.equal(first.status,'accepted');assert.match(lastMime,/To: recipient@example.test\r\n/);
 const count=sends;const replay=await (await call('/api/mail/send','POST',body)).json();assert.equal(replay.id,first.id);assert.equal(sends,count);
 assert.equal((await call('/api/mail/send','POST',{...body,body:'changed'})).status,409);
 failSend=true;const uncertain={...body,provider:'outlook',requestKey:randomUUID()};const result=await (await call('/api/mail/send','POST',uncertain)).json();assert.equal(result.status,'unknown');const after=sends;await call('/api/mail/send','POST',uncertain);assert.equal(sends,after);failSend=false;
 assert.deepEqual(await (await call('/api/mail/outgoing','GET',undefined,bob)).json(),[]);
});
test('refresh rotation persists even when the subsequent read fails, and disconnect removes credentials',async()=>{
 const [row]=await db.select().from(mailConnections).where(and(eq(mailConnections.userId,aliceId),eq(mailConnections.provider,'gmail')));
 const tokens=JSON.parse(unseal(row.tokens!,`mail:${aliceId}:gmail`));tokens.expiresAt=0;
 await db.update(mailConnections).set({tokens:seal(JSON.stringify(tokens),`mail:${aliceId}:gmail`)}).where(eq(mailConnections.id,row.id));
 failRead=true;assert.equal((await call('/api/mail/gmail/recent')).status,502);failRead=false;
 const [updated]=await db.select().from(mailConnections).where(eq(mailConnections.id,row.id));assert.equal(JSON.parse(unseal(updated.tokens!,`mail:${aliceId}:gmail`)).refresh,'fixture-refresh-1');assert.equal(updated.leaseKey,null);
 const attempt=await authorize('gmail');assert.equal((await call('/api/mail/gmail','DELETE')).status,200);
 const [removed]=await db.select().from(mailConnections).where(eq(mailConnections.id,row.id));assert.equal(removed.tokens,null);assert.equal(removed.address,null);
 assert.equal((await db.select().from(mailAuthorizations).where(eq(mailAuthorizations.id,attempt.attemptId))).length,0);
 assert.notEqual((await call('/api/mail/gmail/recent')).status,200);
});
