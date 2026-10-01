import { Text, View } from "react-native";
import { router } from "expo-router";
import { Action, Copy, Feedback, colors } from "./ui";
import { design } from "./dashboard";
import { useResource } from "../lib/use-resource";
import { useSession } from "../lib/session";
import type { NutritionDay } from "../../../shared/nutrition";
import type { Routine, RoutineLog } from "../lib/routines";

export function HomeSummary() {
  const { user } = useSession();
  const food = useResource<NutritionDay>("/api/nutrition/day");
  const routines = useResource<Routine[]>("/api/users/me/medications");
  const logs = useResource<RoutineLog[]>("/api/routine-logs");
  const day = (value: string | Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: user?.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  const active = routines.data?.filter((r) => r.isActive) || [];
  const recorded = active.filter((r) =>
    logs.data?.some(
      (l) => l.medicationId === r.id && day(l.recordedAt) === day(new Date()),
    ),
  ).length;
  const nutrition = food.error ? null : food.data;
  const remaining =
    nutrition?.targets.calories == null
      ? null
      : nutrition.targets.calories - nutrition.totals.calories;
  return (
    <>
      <View
        style={{
          gap: 10,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={design.row}>
          <View style={{ flex: 1 }}>
            <Copy strong>Food</Copy>
          </View>
          <Action
            secondary
            label="Open diary →"
            onPress={() => router.navigate("/food")}
          />
        </View>
        <Feedback message={food.error} error />
        {nutrition ? (
          <>
            <Text
              style={{ color: colors.text, fontSize: 27, fontWeight: "600" }}
            >
              {Math.round(
                remaining === null
                  ? nutrition.totals.calories
                  : Math.abs(remaining),
              ).toLocaleString()}
              <Text style={design.caption}>
                {" "}
                {remaining === null
                  ? "kcal logged"
                  : remaining >= 0
                    ? "kcal remaining"
                    : "kcal above target"}
              </Text>
            </Text>
            {nutrition.targets.calories !== null && (
              <Text style={design.caption}>
                {nutrition.totals.calories} / {nutrition.targets.calories} kcal
              </Text>
            )}
            {!!nutrition.targets.calories && (
              <View style={design.rail}>
                <View
                  style={{
                    height: 5,
                    backgroundColor: colors.accent,
                    width: `${Math.min(100, (nutrition.totals.calories / nutrition.targets.calories) * 100)}%`,
                  }}
                />
              </View>
            )}
            <Text style={design.caption}>
              {(["protein", "carbs", "fat"] as const)
                .map(
                  (k) =>
                    `${k[0].toUpperCase() + k.slice(1)} ${nutrition.totals[k]}${nutrition.targets[k] === null ? "" : ` / ${nutrition.targets[k]}`} g`,
                )
                .join(" · ")}
            </Text>
          </>
        ) : (
          <Copy>
            {food.loading
              ? "Loading nutrition…"
              : "Nutrition is unavailable. Pull down to retry."}
          </Copy>
        )}
      </View>
      <View style={{ gap: 8 }}>
        <View style={design.row}>
          <View style={{ flex: 1 }}>
            <Copy strong>Daily routines</Copy>
          </View>
          <Action
            secondary
            label="Open →"
            onPress={() => router.navigate("/health")}
          />
        </View>
        <Feedback message={routines.error || logs.error} error />
        <Text style={design.caption}>
          {routines.loading || logs.loading
            ? "Loading your routines…"
            : routines.error || logs.error
              ? "Routine totals unavailable."
              : active.length
                ? `${recorded} of ${active.length} active items logged or skipped today`
                : "Add your supplements or medication to start tracking."}
        </Text>
      </View>
    </>
  );
}
