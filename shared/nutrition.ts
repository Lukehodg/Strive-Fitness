export type NutritionValues = { calories: number; protein: number; carbs: number; fat: number };
export type FoodPortion = {
  name: string; mealType: "breakfast" | "lunch" | "dinner" | "snack";
  basis: "serving" | "100g" | "100ml"; amount: number;
  nutrients: NutritionValues; timestamp: string;
};
export function portionTotals(food: Pick<FoodPortion, "basis" | "amount" | "nutrients">): NutritionValues {
  const factor = food.amount / (food.basis === "serving" ? 1 : 100);
  return { calories: Math.round(food.nutrients.calories * factor),
    protein: Math.round(food.nutrients.protein * factor * 10) / 10,
    carbs: Math.round(food.nutrients.carbs * factor * 10) / 10,
    fat: Math.round(food.nutrients.fat * factor * 10) / 10 };
}
export type FoodEntry = NutritionValues & {id:number; name:string; timestamp:string; foods: unknown};
export type NutritionDay = {
  date: string; timezone: string; entries: FoodEntry[]; totals: NutritionValues;
  targets: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
};
export function savedPortion(entry: FoodEntry): FoodPortion | null {
  const foods = entry.foods;
  if (!Array.isArray(foods) || foods.length !== 1 || foods[0]?.nutritionVersion !== 1) return null;
  const food = foods[0];
  return {name:entry.name, timestamp:entry.timestamp, mealType:food.mealType, basis:food.basis, amount:food.quantity, nutrients:food.nutrients};
}
