export type ScannedFood = {
  name: string;
  values: { calories: string; protein: string; carbs: string; fat: string };
  barcode: string;
};
export function parseProduct(payload: unknown, barcode: string): ScannedFood {
  const data = payload as {
    status?: number;
    product?: {
      product_name?: unknown;
      brands?: unknown;
      nutriments?: Record<string, unknown>;
    };
  } | null;
  if (data?.status !== 1 || !data.product)
    throw new Error(
      "Product not found. Try another barcode or enter the label manually.",
    );
  const product = data.product;
  const n = product.nutriments || {};
  const number = (v: unknown): string =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? String(v) : "";
  let calories = number(n["energy-kcal_100g"]);
  if (!calories && number(n["energy-kj_100g"]))
    calories = String(
      Math.round((Number(n["energy-kj_100g"]) / 4.184) * 10) / 10,
    );
  return {
    barcode,
    name:
      typeof product.product_name === "string"
        ? product.product_name.slice(0, 200)
        : "",
    values: {
      calories,
      protein: number(n.proteins_100g),
      carbs: number(n.carbohydrates_100g),
      fat: number(n.fat_100g),
    },
  };
}
export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<ScannedFood> {
  if (!/^(\d{8}|\d{12,14})$/.test(barcode))
    throw new Error("Use a food product's EAN or UPC barcode.");
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,nutriments`,
    {
      signal,
      headers: {
        "User-Agent":
          "StriveFitness/1.0 (https://github.com/Lukehodg/Strive-Fitness)",
      },
    },
  );
  if (response.status === 404)
    throw new Error("Product not found. Enter the label manually.");
  if (!response.ok)
    throw new Error(
      "Product lookup is unavailable. Try again shortly or enter the label manually.",
    );
  return parseProduct(await response.json(), barcode);
}
