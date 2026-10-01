import { FoodScanner } from "../../components/food-scanner";
import {
  Segments,
  Metric,
  SectionTitle,
  design,
} from "../../components/dashboard";
import { useRef, useState } from "react";
import { RefreshControl, View, Text } from "react-native";
import { randomUUID } from "expo-crypto";
import {
  Screen,
  Heading,
  Card,
  Copy,
  Field,
  Action,
  Feedback,
  colors,
} from "../../components/ui";
import { useResource } from "../../lib/use-resource";
import { useSession } from "../../lib/session";
import { request, ApiError } from "../../lib/api";
import {
  portionTotals,
  savedPortion,
  type FoodEntry,
  type FoodPortion,
  type NutritionDay,
} from "../../../../shared/nutrition";

const keys = ["calories", "protein", "carbs", "fat"] as const;
const empty = { calories: "", protein: "", carbs: "", fat: "" };
export default function Food() {
  const [scanner, setScanner] = useState(false);
  const [panel, setPanel] = useState<"Diary" | "Add food" | "History">("Diary");
  const { token } = useSession();
  const [date, setDate] = useState("");
  const [viewDate, setViewDate] = useState("");
  const resource = useResource<NutritionDay>(
    `/api/nutrition/day${viewDate ? `?date=${encodeURIComponent(viewDate)}` : ""}`,
  );
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1");
  const [basis, setBasis] = useState<FoodPortion["basis"]>("serving");
  const [mealType, setMealType] = useState<FoodPortion["mealType"]>("snack");
  const [values, setValues] = useState(empty);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [targets, setTargets] = useState<typeof empty | null>(null);
  const pending = useRef<{ requestKey: string; food: FoodPortion } | null>(
    null,
  );
  const nutrients = Object.fromEntries(
    keys.map((k) => [k, Number(values[k])]),
  ) as FoodPortion["nutrients"];
  const preview = portionTotals({ basis, amount: Number(amount), nutrients });
  const valid =
    name.trim() &&
    amount.trim() &&
    Number(amount) > 0 &&
    keys.every(
      (k) =>
        values[k].trim() && Number.isFinite(nutrients[k]) && nutrients[k] >= 0,
    );
  function reset() {
    setName("");
    setAmount("1");
    setValues(empty);
    setEditing(null);
    pending.current = null;
  }
  function load(entry: FoodEntry, edit: boolean) {
    setPanel("Add food");
    const portion = savedPortion(entry);
    setName(entry.name);
    setBasis(portion?.basis || "serving");
    setMealType(portion?.mealType || "snack");
    setAmount(String(portion?.amount || 1));
    setValues(
      Object.fromEntries(
        keys.map((k) => [k, String(portion?.nutrients[k] ?? entry[k])]),
      ) as typeof empty,
    );
    setEditing(edit ? entry : null);
    pending.current = null;
    setMessage(
      edit
        ? "Editing this food entry. Its original date is preserved."
        : "Ready to log again today. Review the portion before saving.",
    );
    setFailed(false);
  }
  async function save() {
    if (!valid) {
      setMessage(
        "Enter a name, positive portion and all four nutrition values.",
      );
      setFailed(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const food: FoodPortion = {
        name: name.trim(),
        basis,
        amount: Number(amount),
        mealType,
        nutrients,
        timestamp:
          editing?.timestamp ||
          pending.current?.food.timestamp ||
          new Date().toISOString(),
      };
      if (editing)
        await request(
          `/api/nutrition/entries/${editing.id}`,
          token,
          "PUT",
          food,
        );
      else {
        if (
          pending.current &&
          JSON.stringify(pending.current.food) !== JSON.stringify(food)
        )
          throw new Error(
            "The previous save is unconfirmed. Retry its unchanged values, or check your log before clearing the form.",
          );
        pending.current ??= { requestKey: randomUUID(), food };
        await request("/api/nutrition/entries", token, "POST", pending.current);
      }
      if (!editing) {
        setViewDate("");
        setDate("");
      }
      reset();
      setPanel("Diary");
      setFailed(false);
      setMessage("Food saved. Totals are updated from your entries.");
      await resource.reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) pending.current = null;
      setFailed(true);
      setMessage(err instanceof Error ? err.message : "Could not save food.");
    } finally {
      setBusy(false);
    }
  }
  async function saveTargets() {
    if (!targets) return;
    setBusy(true);
    setMessage("");
    try {
      const names = {
        calories: "dailyCalorieTarget",
        protein: "dailyProteinTarget",
        carbs: "dailyCarbsTarget",
        fat: "dailyFatTarget",
      };
      const values = Object.fromEntries(
        keys.map((k) => [
          names[k],
          targets[k].trim() ? Number(targets[k]) : null,
        ]),
      );
      if (
        Object.values(values).some(
          (v) => v !== null && (!Number.isInteger(v) || v < 0),
        )
      )
        throw new Error("Use whole numbers or leave a target empty.");
      await request("/api/user/me", token, "PATCH", values);
      setTargets(null);
      setFailed(false);
      setMessage("Your chosen targets are saved.");
      await resource.reload();
    } catch (err) {
      setFailed(true);
      setMessage(
        err instanceof Error ? err.message : "Could not save targets.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      scrollKey={`${panel}-${editing?.id ?? "new"}`}
      refreshControl={
        <RefreshControl
          refreshing={resource.loading}
          onRefresh={() => void resource.reload()}
          tintColor={colors.accent}
        />
      }
    >
      {scanner && (
        <FoodScanner
          onClose={() => setScanner(false)}
          onProduct={(product, unit) => {
            reset();
            setName(product.name);
            setValues(product.values);
            setBasis(unit);
            setAmount("100");
            setPanel("Add food");
            setScanner(false);
            setFailed(false);
            setMessage(
              "From Open Food Facts. Check the label, fill any missing values and adjust your portion before saving.",
            );
          }}
        />
      )}
      <Action
        label="Scan food barcode"
        disabled={busy || !!editing || !!name}
        onPress={() => {
          if (pending.current) {
            setFailed(true);
            setMessage(
              "Check your log and clear the unconfirmed entry before scanning.",
            );
            return;
          }
          setScanner(true);
        }}
      />
      {(!!editing || !!name) && (
        <Copy>
          Save or clear your current food form to scan another product.
        </Copy>
      )}
      <Heading
        eyebrow="FOOD & FUEL"
        title="Fuel your day."
        subtitle="Label values, real portions and a clear daily picture."
      />
      <Feedback
        message={resource.error || message}
        error={!!resource.error || failed}
      />
      {resource.data && (
        <View style={design.hero}>
          <Text style={design.eyebrow}>
            DAILY NUTRITION | {resource.data.date}
          </Text>
          <View style={design.metrics}>
            <Metric
              label="Energy logged"
              value={resource.data.totals.calories}
              suffix="kcal"
            />
            <Metric
              label="Your calorie target"
              value={resource.data.targets.calories ?? "-"}
              suffix="kcal"
            />
          </View>
          <View style={design.divider}>
            <View style={design.metrics}>
              {(["protein", "carbs", "fat"] as const).map((k) => (
                <View key={k} style={{ flex: 1, gap: 10 }}>
                  <Metric
                    label={k.charAt(0).toUpperCase() + k.slice(1)}
                    value={resource.data!.totals[k]}
                    suffix="g"
                  />
                  <View style={design.rail}>
                    <View
                      style={{
                        height: 5,
                        backgroundColor:
                          k === "protein"
                            ? colors.accent
                            : k === "carbs"
                              ? "#dac69c"
                              : "#b5b7de",
                        width: `${resource.data!.targets[k] ? Math.min(100, (resource.data!.totals[k] / resource.data!.targets[k]!) * 100) : 0}%`,
                      }}
                    />
                  </View>
                  <Text style={design.caption}>
                    {resource.data!.targets[k] === null
                      ? "No target set"
                      : `of ${resource.data!.targets[k]} g`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
          <Action
            label="+ Log food"
            disabled={busy}
            onPress={() => setPanel("Add food")}
          />
          <Action
            secondary
            label="Adjust daily targets"
            disabled={busy}
            onPress={() =>
              setTargets(
                Object.fromEntries(
                  keys.map((k) => [
                    k,
                    resource.data!.targets[k]?.toString() || "",
                  ]),
                ) as typeof empty,
              )
            }
          />
        </View>
      )}
      <Segments
        options={["Diary", "Add food", "History"] as const}
        value={panel}
        onChange={setPanel}
      />
      {targets && (
        <Card>
          <Copy strong>Your daily targets</Copy>
          {keys.map((k) => (
            <Field
              key={k}
              label={`${k} (${k === "calories" ? "kcal" : "g"}) Â· optional`}
              value={targets[k]}
              onChangeText={(v) => setTargets({ ...targets, [k]: v })}
              keyboardType="number-pad"
              editable={!busy}
            />
          ))}
          <Action
            label="Save targets"
            disabled={busy}
            onPress={() => void saveTargets()}
          />
          <Action
            secondary
            label="Cancel"
            disabled={busy}
            onPress={() => setTargets(null)}
          />
        </Card>
      )}
      {panel === "Add food" && (
        <Card>
          <Copy strong>{editing ? "Edit food" : "Log food for today"}</Copy>
          <Field
            label="Food name"
            value={name}
            onChangeText={setName}
            maxLength={200}
            editable={!busy}
          />
          <Copy>Meal</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["breakfast", "lunch", "dinner", "snack"] as const).map((v) => (
              <Action
                key={v}
                label={v}
                secondary={mealType !== v}
                disabled={busy}
                onPress={() => setMealType(v)}
              />
            ))}
          </View>
          <Copy>Nutrition values on your label</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["serving", "100g", "100ml"] as const).map((v) => (
              <Action
                key={v}
                label={`Per ${v}`}
                secondary={basis !== v}
                disabled={busy}
                onPress={() => setBasis(v)}
              />
            ))}
          </View>
          {keys.map((k) => (
            <Field
              key={k}
              label={`${k} (${k === "calories" ? "kcal" : "g"}) per ${basis}`}
              value={values[k]}
              onChangeText={(v) => setValues({ ...values, [k]: v })}
              keyboardType="decimal-pad"
              editable={!busy}
            />
          ))}
          <Field
            label={
              basis === "serving"
                ? "Servings eaten"
                : basis === "100g"
                  ? "Grams eaten"
                  : "Millilitres consumed"
            }
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!busy}
          />
          {!!valid && (
            <Copy strong>
              Your portion: {preview.calories} kcal Â· P {preview.protein}g Â· C{" "}
              {preview.carbs}g Â· F {preview.fat}g
            </Copy>
          )}
          <Action
            label={busy ? "Savingâ€¦" : editing ? "Update food" : "Save food"}
            disabled={busy}
            onPress={() => void save()}
          />
          <Action
            secondary
            label="Clear form"
            disabled={busy}
            onPress={reset}
          />
        </Card>
      )}
      {panel === "History" && (
        <Card>
          <Copy strong>Food history</Copy>
          <Field
            label="Date (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="Leave empty for today"
            maxLength={10}
          />
          <Action
            secondary
            label="Show date"
            onPress={() => {
              if (
                date &&
                (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                  Number.isNaN(Date.parse(date)) ||
                  new Date(date).toISOString().slice(0, 10) !== date)
              ) {
                setFailed(true);
                setMessage("Enter a valid date.");
                return;
              }
              setViewDate(date);
            }}
          />
        </Card>
      )}
      {panel !== "Add food" && (
        <>
          <SectionTitle
            title={viewDate ? "Your food diary" : "Today's meals"}
            detail={
              resource.data
                ? `${resource.data.entries.length} entries`
                : "Loading..."
            }
          />
          {(["breakfast", "lunch", "dinner", "snack"] as const).map((meal) => {
            const entries =
              resource.data?.entries.filter(
                (e) => (savedPortion(e)?.mealType || "snack") === meal,
              ) || [];
            return (
              <Card key={meal}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <Copy strong>
                    {meal.charAt(0).toUpperCase() + meal.slice(1)}
                  </Copy>
                  <Text style={design.caption}>
                    {entries.reduce((n, e) => n + e.calories, 0)} kcal
                  </Text>
                </View>
                {entries.length === 0 && (
                  <Copy>
                    {resource.loading
                      ? "Loading entries..."
                      : "Nothing logged yet."}
                  </Copy>
                )}
                {entries.map((entry) => (
                  <View key={entry.id} style={design.divider}>
                    <Copy strong>{entry.name}</Copy>
                    <Text style={design.caption}>
                      {entry.calories} kcal | Protein {entry.protein}g | Carbs{" "}
                      {entry.carbs}g | Fat {entry.fat}g
                    </Text>
                    <View style={design.row}>
                      <View style={{ flex: 1 }}>
                        <Action
                          secondary
                          label="Edit"
                          disabled={busy}
                          onPress={() => load(entry, true)}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Action
                          secondary
                          label="Log again"
                          disabled={busy}
                          onPress={() => load(entry, false)}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            );
          })}
          <Copy>
            Daily totals use{" "}
            {resource.data?.timezone || "your account timezone"}. Targets are
            yours to choose.
          </Copy>
        </>
      )}
    </Screen>
  );
}
