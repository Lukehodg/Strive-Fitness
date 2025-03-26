import axios from 'axios';

export interface OpenFoodProduct {
  product_name: string;
  nutriments: {
    energy_100g?: number;
    energy_serving?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    sugars_100g?: number;
    salt_100g?: number;
    fiber_100g?: number;
  };
  serving_quantity?: string;
  serving_size?: string;
  quantity?: string;
  brands?: string;
  image_url?: string;
}

export interface FoodData {
  food_name: string;
  nf_calories: number;
  nf_protein: number;
  nf_total_carbohydrate: number;
  nf_total_fat: number;
  serving_qty: number;
  serving_unit: string;
  serving_weight_grams: number;
  image?: string;
}

/**
 * Get product information from Open Food Facts API by barcode
 */
export async function getProductByBarcode(barcode: string): Promise<FoodData | null> {
  try {
    console.log(`Searching for product with barcode: ${barcode}`);
    const response = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
    
    if (response.status !== 200 || response.data.status !== 1) {
      console.log('Product not found or API error');
      return null;
    }
    
    const product: OpenFoodProduct = response.data.product;
    
    // Extract and normalize the data
    const servingSize = extractServingSize(product);
    
    // Try to parse the quantity from the product data
    let quantity = 1; // Default quantity
    let packageUnit = 'g';
    
    // Try to extract quantity from product.quantity (e.g. "500ml", "1kg", etc.)
    if (product.quantity) {
      const qtyMatch = product.quantity.match(/(\d+)\s*([a-zA-Z]+)/);
      if (qtyMatch && qtyMatch.length >= 3) {
        quantity = parseFloat(qtyMatch[1]);
        packageUnit = qtyMatch[2].toLowerCase();
        
        // Normalize units
        if (['ml', 'milliliter', 'millilitre'].includes(packageUnit)) {
          packageUnit = 'ml';
        } else if (['l', 'liter', 'litre'].includes(packageUnit)) {
          quantity = quantity * 1000;
          packageUnit = 'ml';
        } else if (['g', 'gram', 'gramme'].includes(packageUnit)) {
          packageUnit = 'g';
        } else if (['kg', 'kilogram', 'kilogramme'].includes(packageUnit)) {
          quantity = quantity * 1000;
          packageUnit = 'g';
        } else if (['mg', 'milligram', 'milligramme'].includes(packageUnit)) {
          quantity = quantity / 1000;
          packageUnit = 'g';
        } else {
          // For other units, try to determine if it's a drink (use ml) or food (use g)
          const isDrink = product.product_name 
            ? /juice|water|beverage|drink|soda|beer|wine|coffee|tea/i.test(product.product_name)
            : false;
          packageUnit = isDrink ? 'ml' : 'g';
        }
      }
    }
    
    // Convert from Open Food Facts format to our app's format
    const foodData: FoodData = {
      food_name: product.product_name || 'Unknown Product',
      nf_calories: (product.nutriments.energy_100g || 0) / 4.184,  // Convert kJ to kcal
      nf_protein: product.nutriments.proteins_100g || 0,
      nf_total_carbohydrate: product.nutriments.carbohydrates_100g || 0,
      nf_total_fat: product.nutriments.fat_100g || 0,
      serving_qty: quantity,
      serving_unit: packageUnit || servingSize.unit,
      serving_weight_grams: servingSize.weight,
      image: product.image_url,
    };
    
    return foodData;
  } catch (error) {
    console.error('Error fetching product from Open Food Facts:', error);
    return null;
  }
}

/**
 * Extract serving size information from product data
 */
function extractServingSize(product: OpenFoodProduct): { unit: string, weight: number } {
  // Default values
  let unit = 'g';
  let weight = 100; // Default to 100g if no serving size is specified
  
  if (product.serving_size) {
    // Try to parse the serving size string (e.g. "100 g", "1 piece (28g)")
    const regex = /(\d+)\s*([a-zA-Z]+)/;
    const match = product.serving_size.match(regex);
    
    if (match && match.length >= 3) {
      weight = parseFloat(match[1]);
      unit = match[2].toLowerCase();
      
      // Normalize unit to g if it's a weight unit
      if (unit === 'kg') {
        weight *= 1000;
        unit = 'g';
      } else if (unit === 'mg') {
        weight /= 1000;
        unit = 'g';
      }
    }
  }
  
  return { unit, weight };
}

/**
 * Fallback data in case API fails
 */
export function getFallbackFoods(): FoodData[] {
  return [
    {
      food_name: 'Chicken Breast',
      nf_calories: 165,
      nf_protein: 31,
      nf_total_carbohydrate: 0,
      nf_total_fat: 3.6,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    },
    {
      food_name: 'Brown Rice',
      nf_calories: 112,
      nf_protein: 2.6,
      nf_total_carbohydrate: 23,
      nf_total_fat: 0.9,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    },
    {
      food_name: 'Broccoli',
      nf_calories: 34,
      nf_protein: 2.8,
      nf_total_carbohydrate: 7,
      nf_total_fat: 0.4,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    },
    {
      food_name: 'Salmon',
      nf_calories: 208,
      nf_protein: 20,
      nf_total_carbohydrate: 0,
      nf_total_fat: 13,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    },
    {
      food_name: 'Greek Yogurt',
      nf_calories: 59,
      nf_protein: 10,
      nf_total_carbohydrate: 3.6,
      nf_total_fat: 0.4,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    }
  ];
}