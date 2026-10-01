import type { Express } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, isNotNull, lt, or, desc } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { db } from "./db";
import { asyncHandler } from "./auth";
import { seal, unseal } from "./wearable-providers";
import { mailConnections as connections, mailAuthorizations as attempts, mailImports as imports, mailOutgoing as outgoing } from "../shared/schema";
import { mailClient, mailConfig, mailError, mailProvider, type MailProvider, type MailFetch, type MailTokens } from "./mail-providers";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
const context=(uid:number,p:MailProvider)=>`mail:${uid}:${p}`;
const owner=(uid:number,p:MailProvider)=>and(eq(connections.userId,uid),eq(connections.provider,p));
const messageInput=z.object({provider:mailProvider,requestKey:z.string().uuid(),recipient:z.string().email().max(254).regex(/^[^\r\n]+$/),subject:z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/),body:z.string().trim().min(1).max(20000),confirmed:z.literal(true)}).strict();

export function registerMailCallbacks(app:Express) {
  app.get("/api/mail/:provider/callback",rateLimit({windowMs:60000,limit:60,standardHeaders:"draft-8",legacyHeaders:false}),asyncHandler(async(req,res)=>{
    res.setHeader("Cache-Control","no-store");res.setHeader("Referrer-Policy","no-referrer");
    const provider=mailProvider.parse(req.params.provider);
    const query=z.object({state:z.string().min(16).max(512),code:z.string().min(1).max(16000).optional(),error:z.string().max(200).optional()}).parse(req.query);
    const [attempt]=await db.update(attempts).set({callbackAt:new Date()}).where(and(eq(attempts.provider,provider),eq(attempts.stateHash,hash(query.state)),gt(attempts.expiresAt,new Date()),isNull(attempts.callbackAt))).returning();
    if(!attempt)throw mailError("This email sign-in has expired or was already used.",400);
    if(query.code && !query.error)await db.update(attempts).set({code:seal(query.code,context(attempt.userId,provider))}).where(eq(attempts.id,attempt.id));
    const url=new URL("strivefitness://mail");url.search=new URLSearchParams({provider,attempt:attempt.id,status:query.code && !query.error ? "ready" : "cancelled"}).toString();
    res.redirect(302,url.toString());
  }));
}
export function registerMail(app:Express,fetcher?:MailFetch) {
  async function locked<T>(uid:number,provider:MailProvider,operation:(row:typeof connections.$inferSelect,client:ReturnType<typeof mailClient>,key:string)=>Promise<T>) {
    const key=randomUUID();
    const [row]=await db.update(connections).set({leaseKey:key,leaseUntil:new Date(Date.now()+5*60_000)}).where(and(owner(uid,provider),or(isNull(connections.leaseUntil),lt(connections.leaseUntil,new Date())))).returning();
    if(!row)throw mailError("The mailbox is busy or not connected. Please retry.");
    try {return await operation(row,mailClient(provider,fetcher),key);}
    finally {await db.update(connections).set({leaseKey:null,leaseUntil:null}).where(and(owner(uid,provider),eq(connections.leaseKey,key)));}
  }
  async function access(uid:number,p:MailProvider,row:typeof connections.$inferSelect,client:ReturnType<typeof mailClient>,key:string) {
    if(!row.tokens || !row.address)throw mailError("Connect your mailbox first.");
    let tokens=JSON.parse(unseal(row.tokens,context(uid,p))) as MailTokens;
    if(tokens.expiresAt<Date.now()+60_000){tokens=await client.refresh(tokens);await db.update(connections).set({tokens:seal(JSON.stringify(tokens),context(uid,p))}).where(and(owner(uid,p),eq(connections.leaseKey,key)));}
    return tokens.access;
  }
  app.get("/api/mail/connections",asyncHandler(async(req,res)=>{
    const rows=await db.select().from(connections).where(eq(connections.userId,req.account.id));
    res.json(Object.fromEntries(mailProvider.options.map(p=>{const row=rows.find(r=>r.provider===p);return [p,{configured:!!mailConfig(p),connected:!!row?.tokens,address:row?.address || null}];})));
  }));
  app.post("/api/mail/:provider/authorize",asyncHandler(async(req,res)=>{
    const provider=mailProvider.parse(req.params.provider),client=mailClient(provider,fetcher);
    const id=randomUUID(),state=randomBytes(32).toString("hex"),claim=randomBytes(32).toString("hex"),verifier=randomBytes(32).toString("base64url");
    await db.delete(attempts).where(lt(attempts.expiresAt,new Date()));
    await db.insert(connections).values({userId:req.account.id,provider}).onConflictDoNothing();
    await db.insert(attempts).values({id,userId:req.account.id,provider,stateHash:hash(state),claimHash:hash(claim),verifier:seal(verifier,context(req.account.id,provider)),expiresAt:new Date(Date.now()+600_000)});
    const url=new URL(client.config.authorize);url.search=new URLSearchParams({client_id:client.config.clientId,redirect_uri:client.config.redirectUri,response_type:"code",scope:client.config.scope,state,code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",...(provider==="gmail" ? {access_type:"offline",prompt:"consent"} : {response_mode:"query",prompt:"select_account"})}).toString();
    res.json({attemptId:id,claimToken:claim,authorizationUrl:url.toString()});
  }));
  app.post("/api/mail/:provider/complete",asyncHandler(async(req,res)=>{
    const p=mailProvider.parse(req.params.provider),input=z.object({attemptId:z.string().uuid(),claimToken:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);
    await locked(req.account.id,p,async(_row,client,key)=>{
      const [attempt]=await db.update(attempts).set({claimedAt:new Date()}).where(and(eq(attempts.id,input.attemptId),eq(attempts.provider,p),eq(attempts.userId,req.account.id),eq(attempts.claimHash,hash(input.claimToken)),gt(attempts.expiresAt,new Date()),isNull(attempts.claimedAt),isNotNull(attempts.code),isNotNull(attempts.callbackAt))).returning();
      if(!attempt?.code || !attempt.callbackAt)throw mailError("Email sign-in is not ready or has expired. Connect again.",400);
      await db.update(attempts).set({code:null,verifier:""}).where(eq(attempts.id,attempt.id));
      const tokens=await client.exchange(unseal(attempt.code,context(req.account.id,p)),unseal(attempt.verifier,context(req.account.id,p)));
      const address=await client.address(tokens.access);
      await db.update(connections).set({tokens:seal(JSON.stringify(tokens),context(req.account.id,p)),address}).where(and(owner(req.account.id,p),eq(connections.leaseKey,key)));
    });
    res.json({connected:true});
  }));
  app.get("/api/mail/:provider/recent",asyncHandler(async(req,res)=>{
    const p=mailProvider.parse(req.params.provider);
    res.json(await locked(req.account.id,p,async(row,client,key)=>client.recent(await access(req.account.id,p,row,client,key))));
  }));
  app.post("/api/mail/:provider/import",asyncHandler(async(req,res)=>{
    const p=mailProvider.parse(req.params.provider),{messageId}=z.object({messageId:z.string().min(1).max(1000)}).strict().parse(req.body);
    const saved=await locked(req.account.id,p,async(row,client,key)=>{
      const token=await access(req.account.id,p,row,client,key);
      const condition=and(eq(imports.userId,req.account.id),eq(imports.provider,p),eq(imports.sourceAddress,row.address!),eq(imports.sourceId,messageId));
      const [existing]=await db.select().from(imports).where(condition);if(existing)return existing;
      const message=await client.read(token,messageId);
      const [entry]=await db.insert(imports).values({...message,userId:req.account.id,provider:p,sourceAddress:row.address!,sourceId:messageId}).returning();return entry;
    });res.status(201).json(saved);
  }));
  app.get("/api/mail/imports",asyncHandler(async(req,res)=>res.json(await db.select().from(imports).where(eq(imports.userId,req.account.id)).orderBy(desc(imports.importedAt)).limit(100))));
  app.patch("/api/mail/imports/:id",asyncHandler(async(req,res)=>{
    const {status}=z.object({status:z.enum(["kept","dismissed"])}).strict().parse(req.body);
    const [entry]=await db.update(imports).set({status}).where(and(eq(imports.id,z.coerce.number().int().positive().parse(req.params.id)),eq(imports.userId,req.account.id))).returning();
    if(!entry)throw mailError("Imported email not found.",404);res.json(entry);
  }));
  app.get("/api/mail/outgoing",asyncHandler(async(req,res)=>res.json(await db.select().from(outgoing).where(eq(outgoing.userId,req.account.id)).orderBy(desc(outgoing.createdAt)).limit(50))));
  app.post("/api/mail/send",asyncHandler(async(req,res)=>{
    const input=messageInput.parse(req.body),requestHash=hash(JSON.stringify(input));
    // Persist the attempt BEFORE contacting the provider. An uncertain result is
    // never retried automatically: sending APIs do not guarantee idempotence.
    const existing=async()=>{const [row]=await db.select().from(outgoing).where(and(eq(outgoing.userId,req.account.id),eq(outgoing.requestKey,input.requestKey)));if(row && row.requestHash!==requestHash)throw mailError("This send request was already used for a different message.");return row;};
    const prior=await existing();if(prior)return res.json(prior);
    const result=await locked(req.account.id,input.provider,async(row,client,key)=>{
      const replay=await existing();if(replay)return replay;
      const token=await access(req.account.id,input.provider,row,client,key);
      const [attempt]=await db.insert(outgoing).values({userId:req.account.id,requestKey:input.requestKey,requestHash,provider:input.provider,recipient:input.recipient,subject:input.subject,body:input.body,status:"sending"}).returning();
      let status="accepted";
      try {await client.send(token,row.address!,input);}catch {status="unknown";}
      const [saved]=await db.update(outgoing).set({status}).where(eq(outgoing.id,attempt.id)).returning();return saved;
    });res.json(result);
  }));
  app.delete("/api/mail/:provider",asyncHandler(async(req,res)=>{
    const p=mailProvider.parse(req.params.provider);
    const [row]=await db.update(connections).set({tokens:null,address:null}).where(and(owner(req.account.id,p),or(isNull(connections.leaseUntil),lt(connections.leaseUntil,new Date())))).returning();
    if(!row)throw mailError("The mailbox is busy. Retry after the current operation.");
    await db.delete(attempts).where(and(eq(attempts.userId,req.account.id),eq(attempts.provider,p)));
    res.json({message:"Strive's stored mailbox credentials were removed. Imported notes are kept. Remove Strive's grant in your Google or Microsoft account to revoke provider access completely."});
  }));
}
