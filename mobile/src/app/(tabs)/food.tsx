import { useRef, useState } from "react";
import { RefreshControl, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Screen, Heading, Card, Copy, Field, Action, Feedback, colors } from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request, ApiError } from "../../lib/api";
import { portionTotals, savedPortion, type FoodEntry, type FoodPortion, type NutritionDay } from "../../../../shared/nutrition";

const keys = ["calories", "protein", "carbs", "fat"] as const;
const empty = {calories:"",protein:"",carbs:"",fat:""};
export default function Food() {
  const { token } = useSession();
  const [date, setDate] = useState("");
  const [viewDate, setViewDate] = useState("");
  const resource = useResource<NutritionDay>(`/api/nutrition/day${viewDate ? `?date=${encodeURIComponent(viewDate)}` : ""}`);
  const [name,setName] = useState("");
  const [amount,setAmount] = useState("1");
  const [basis,setBasis] = useState<FoodPortion["basis"]>("serving");
  const [mealType,setMealType] = useState<FoodPortion["mealType"]>("snack");
  const [values,setValues] = useState(empty);
  const [editing,setEditing] = useState<FoodEntry | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [failed,setFailed] = useState(false);
  const [targets,setTargets] = useState<typeof empty | null>(null);
  const pending = useRef<{requestKey:string;food:FoodPortion} | null>(null);
  const nutrients = Object.fromEntries(keys.map(k=>[k,Number(values[k])])) as FoodPortion["nutrients"];
  const preview = portionTotals({basis,amount:Number(amount),nutrients});
  const valid = name.trim() && amount.trim() && Number(amount)>0 && keys.every(k=>values[k].trim() && Number.isFinite(nutrients[k]) && nutrients[k]>=0);
  function reset() {setName("");setAmount("1");setValues(empty);setEditing(null);pending.current=null;}
  function load(entry:FoodEntry,edit:boolean) {
    const portion = savedPortion(entry);
    setName(entry.name); setBasis(portion?.basis || "serving");setMealType(portion?.mealType || "snack");setAmount(String(portion?.amount || 1));
    setValues(Object.fromEntries(keys.map(k=>[k,String(portion?.nutrients[k] ?? entry[k])])) as typeof empty);
    setEditing(edit ? entry : null);pending.current=null;
    setMessage(edit ? "Editing this food entry. Its original date is preserved." : "Ready to log again today. Review the portion before saving.");setFailed(false);
  }
  async function save() {
    if (!valid) {setMessage("Enter a name, positive portion and all four nutrition values.");setFailed(true);return;}
    setBusy(true);setMessage("");
    try {
      const food:FoodPortion = {name:name.trim(),basis,amount:Number(amount),mealType,nutrients,timestamp:editing?.timestamp || pending.current?.food.timestamp || new Date().toISOString()};
      if (editing) await request(`/api/nutrition/entries/${editing.id}`,token,"PUT",food);
      else {
        if (pending.current && JSON.stringify(pending.current.food)!==JSON.stringify(food)) throw new Error("The previous save is unconfirmed. Retry its unchanged values, or check your log before clearing the form.");
        pending.current ??= {requestKey:randomUUID(),food};
        await request("/api/nutrition/entries",token,"POST",pending.current);
      }
      if (!editing) {setViewDate("");setDate("");}
      reset();setFailed(false);setMessage("Food saved. Totals are updated from your entries.");await resource.reload();
    } catch(err) {if(err instanceof ApiError && err.status===400)pending.current=null;setFailed(true);setMessage(err instanceof Error ? err.message : "Could not save food.");}
    finally {setBusy(false);}
  }
  async function saveTargets() {
    if (!targets) return;setBusy(true);setMessage("");
    try {
      const names = {calories:"dailyCalorieTarget",protein:"dailyProteinTarget",carbs:"dailyCarbsTarget",fat:"dailyFatTarget"};
      const values = Object.fromEntries(keys.map(k=>[names[k],targets[k].trim() ? Number(targets[k]) : null]));
      if (Object.values(values).some(v=>v!==null && (!Number.isInteger(v) || v<0))) throw new Error("Use whole numbers or leave a target empty.");
      await request("/api/user/me",token,"PATCH",values);setTargets(null);setFailed(false);setMessage("Your chosen targets are saved.");await resource.reload();
    } catch(err) {setFailed(true);setMessage(err instanceof Error ? err.message : "Could not save targets.");} finally {setBusy(false);}
  }
  return <Screen refreshControl={<RefreshControl refreshing={resource.loading} onRefresh={()=>void resource.reload()} tintColor={colors.accent}/> }>
    <Heading eyebrow="FOOD & FUEL" title="Fuel your day." subtitle="Label values, real portions and a clear daily picture."/>
    <Feedback message={resource.error || message} error={!!resource.error || failed}/>
    {resource.data && <Card><Copy strong>{resource.data.date} · {resource.data.timezone}</Copy>
      {keys.map(k=><View key={k} style={{gap:6}}><Copy strong>{k}: {resource.data!.totals[k]}{k==="calories" ? " kcal" : " g"}{resource.data!.targets[k] !== null ? ` / ${resource.data!.targets[k]}` : " · no target"}</Copy>
        {resource.data!.targets[k] !== null && resource.data!.targets[k]!>0 && <View style={{height:6,backgroundColor:colors.border,borderRadius:4}}><View style={{height:6,borderRadius:4,backgroundColor:colors.accent,width:`${Math.min(100,resource.data!.totals[k]/resource.data!.targets[k]!*100)}%`}}/></View>}
      </View>)}
      <Action secondary label="Edit my targets" disabled={busy} onPress={()=>setTargets(Object.fromEntries(keys.map(k=>[k,resource.data!.targets[k]?.toString() || ""])) as typeof empty)}/>
      <Copy>Targets are chosen by you. Device recovery does not automatically change your calories.</Copy>
    </Card>}
    {targets && <Card><Copy strong>Your daily targets</Copy>{keys.map(k=><Field key={k} label={`${k} (${k==="calories" ? "kcal" : "g"}) · optional`} value={targets[k]} onChangeText={v=>setTargets({...targets,[k]:v})} keyboardType="number-pad" editable={!busy}/>)}<Action label="Save targets" disabled={busy} onPress={()=>void saveTargets()}/><Action secondary label="Cancel" disabled={busy} onPress={()=>setTargets(null)}/></Card>}
    <Card><Copy strong>{editing ? "Edit food" : "Log food for today"}</Copy><Field label="Food name" value={name} onChangeText={setName} maxLength={200} editable={!busy}/>
      <Copy>Meal</Copy><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{(["breakfast","lunch","dinner","snack"] as const).map(v=><Action key={v} label={v} secondary={mealType!==v} disabled={busy} onPress={()=>setMealType(v)}/>)}</View>
      <Copy>Nutrition values on your label</Copy><View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{(["serving","100g","100ml"] as const).map(v=><Action key={v} label={`Per ${v}`} secondary={basis!==v} disabled={busy} onPress={()=>setBasis(v)}/>)}</View>
      {keys.map(k=><Field key={k} label={`${k} (${k==="calories" ? "kcal" : "g"}) per ${basis}`} value={values[k]} onChangeText={v=>setValues({...values,[k]:v})} keyboardType="decimal-pad" editable={!busy}/>)}
      <Field label={basis==="serving" ? "Servings eaten" : basis==="100g" ? "Grams eaten" : "Millilitres consumed"} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy}/>
      {!!valid && <Copy strong>Your portion: {preview.calories} kcal · P {preview.protein}g · C {preview.carbs}g · F {preview.fat}g</Copy>}
      <Action label={busy ? "Saving…" : editing ? "Update food" : "Save food"} disabled={busy} onPress={()=>void save()}/><Action secondary label="Clear form" disabled={busy} onPress={reset}/>
    </Card>
    <Card><Copy strong>Food history</Copy><Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="Leave empty for today" maxLength={10}/><Action secondary label="Show date" onPress={()=>{if(date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)){setFailed(true);setMessage("Enter a valid date.");return;}setViewDate(date);}}/></Card>
    {resource.data?.entries.length === 0 && <Copy>No food logged on this day.</Copy>}
    {resource.data?.entries.map(entry=><Card key={entry.id}><Copy strong>{entry.name}</Copy><Copy>{savedPortion(entry)?.mealType || "Food"} · {entry.calories} kcal · P {entry.protein}g · C {entry.carbs}g · F {entry.fat}g</Copy><Action secondary label="Edit entry" disabled={busy} onPress={()=>load(entry,true)}/><Action secondary label="Log again today" disabled={busy} onPress={()=>load(entry,false)}/></Card>)}
  </Screen>;
}
