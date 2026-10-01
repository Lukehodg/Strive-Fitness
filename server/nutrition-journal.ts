import type { Express } from "express";
import { createHash } from "node:crypto";
import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { meals, users } from "../shared/schema";
import { portionTotals } from "../shared/nutrition";
import { asyncHandler } from "./auth";

const portion = z.object({
  name:z.string().trim().min(1).max(200), mealType:z.enum(["breakfast","lunch","dinner","snack"]),
  basis:z.enum(["serving","100g","100ml"]), amount:z.number().positive().max(10000),
  nutrients:z.object({calories:z.number().min(0).max(20000), protein:z.number().min(0).max(5000), carbs:z.number().min(0).max(5000),fat:z.number().min(0).max(5000)}).strict(),
  timestamp:z.string().datetime({offset:true}),
}).strict().refine(value => {const t = portionTotals(value); return t.calories <= 20000 && t.protein <= 5000 && t.carbs <= 5000 && t.fat <= 5000;}, "The portion exceeds supported nutrition limits.");
const fail = (message:string,status:number): never => {throw Object.assign(new Error(message),{status});};
function values(input:z.infer<typeof portion>) {
  return { name:input.name,timestamp:new Date(input.timestamp),...portionTotals(input),foods:[{nutritionVersion:1,name:input.name,quantity:input.amount,unit:input.basis === "serving" ? "serving" : input.basis === "100g" ? "g" : "ml",basis:input.basis,mealType:input.mealType,nutrients:input.nutrients}] };
}
export function registerNutritionJournal(app:Express) {
  app.get("/api/nutrition/day",asyncHandler(async(req,res)=>{
    const today = new Intl.DateTimeFormat("en-CA",{timeZone:req.account.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date ?? today);
    if (Number.isNaN(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day) fail("Invalid date.",400);
    const entries = await db.select().from(meals).where(and(eq(meals.userId,req.account.id),sql`to_char(timezone(${req.account.timezone}, ${meals.timestamp}), 'YYYY-MM-DD') = ${day}`)).orderBy(desc(meals.timestamp),desc(meals.id));
    const totals = entries.reduce((t,e)=>({calories:t.calories+e.calories,protein:t.protein+e.protein,carbs:t.carbs+e.carbs,fat:t.fat+e.fat}),{calories:0,protein:0,carbs:0,fat:0});
    for (const key of ["protein","carbs","fat"] as const) totals[key] = Math.round(totals[key]*10)/10;
    res.json({date:day,timezone:req.account.timezone,entries,totals,targets:{calories:req.account.dailyCalorieTarget,protein:req.account.dailyProteinTarget,carbs:req.account.dailyCarbsTarget,fat:req.account.dailyFatTarget}});
  }));
  app.post("/api/nutrition/entries",asyncHandler(async(req,res)=>{
    const {requestKey, food} = z.object({requestKey:z.string().uuid(),food:portion}).strict().parse(req.body);
    const hash = createHash("sha256").update(JSON.stringify(food)).digest("hex");
    const entry = await db.transaction(async tx=>{
      await tx.select({id:users.id}).from(users).where(eq(users.id,req.account.id)).for("update");
      const [existing] = await tx.select().from(meals).where(and(eq(meals.userId,req.account.id),eq(meals.creationKey,requestKey)));
      if (existing) { if (existing.creationHash !== hash) fail("This request was already saved with different values. Refresh your food log.",409); return existing; }
      const [saved] = await tx.insert(meals).values({...values(food),userId:req.account.id,creationKey:requestKey,creationHash:hash}).returning();
      return saved;
    });
    res.status(201).json(entry);
  }));
  app.put("/api/nutrition/entries/:id",asyncHandler(async(req,res)=>{
    const input = portion.parse(req.body);
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [entry] = await db.update(meals).set(values(input)).where(and(eq(meals.id,id),eq(meals.userId,req.account.id))).returning();
    if (!entry) fail("Food entry not found.",404);
    res.json(entry);
  }));
}
