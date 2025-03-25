import axios from 'axios';

// This is a placeholder interface for the food data response
interface FoodData {
  food_name: string;
  nf_calories: number;
  nf_protein: number;
  nf_total_carbohydrate: number;
  nf_total_fat: number;
  serving_qty: number;
  serving_unit: string;
  serving_weight_grams: number;
}

/**
 * Search for foods using the Nutritionix API
 * Requires API credentials set in environment variables:
 * - NUTRITIONIX_APP_ID
 * - NUTRITIONIX_API_KEY
 */
export async function searchFoods(query: string): Promise<FoodData[]> {
  const appId = process.env.NUTRITIONIX_APP_ID;
  const apiKey = process.env.NUTRITIONIX_API_KEY;
  
  if (!appId || !apiKey) {
    throw new Error('Nutritionix API credentials not configured');
  }
  
  try {
    const response = await axios.post(
      'https://trackapi.nutritionix.com/v2/natural/nutrients',
      { query },
      {
        headers: {
          'x-app-id': appId,
          'x-app-key': apiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.foods;
  } catch (error) {
    console.error('Error fetching nutrition data:', error);
    throw new Error('Failed to fetch nutrition data');
  }
}

/**
 * This function provides a fallback for testing when API credentials are not available
 */
export function getFallbackFoods(query: string): FoodData[] {
  const lowerQuery = query.toLowerCase();
  const foods: FoodData[] = [];
  
  // Return empty array for empty queries
  if (!query.trim()) {
    return foods;
  }
  
  // Common foods with nutrition data
  if (lowerQuery.includes('chicken') || lowerQuery.includes('breast')) {
    foods.push({
      food_name: 'Chicken Breast',
      nf_calories: 165,
      nf_protein: 31,
      nf_total_carbohydrate: 0,
      nf_total_fat: 3.6,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    });
  }
  
  if (lowerQuery.includes('rice') || lowerQuery.includes('brown')) {
    foods.push({
      food_name: 'Brown Rice',
      nf_calories: 112,
      nf_protein: 2.6,
      nf_total_carbohydrate: 23.5,
      nf_total_fat: 0.9,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    });
  }
  
  if (lowerQuery.includes('egg')) {
    foods.push({
      food_name: 'Egg',
      nf_calories: 72,
      nf_protein: 6.3,
      nf_total_carbohydrate: 0.4,
      nf_total_fat: 5,
      serving_qty: 1,
      serving_unit: 'large',
      serving_weight_grams: 50
    });
  }
  
  if (lowerQuery.includes('salmon')) {
    foods.push({
      food_name: 'Salmon',
      nf_calories: 206,
      nf_protein: 22.1,
      nf_total_carbohydrate: 0,
      nf_total_fat: 12.4,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    });
  }
  
  if (lowerQuery.includes('broccoli')) {
    foods.push({
      food_name: 'Broccoli',
      nf_calories: 34,
      nf_protein: 2.8,
      nf_total_carbohydrate: 6.6,
      nf_total_fat: 0.4,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    });
  }
  
  if (lowerQuery.includes('greek yogurt') || lowerQuery.includes('yogurt')) {
    foods.push({
      food_name: 'Greek Yogurt',
      nf_calories: 59,
      nf_protein: 10,
      nf_total_carbohydrate: 3.6,
      nf_total_fat: 0.4,
      serving_qty: 100,
      serving_unit: 'g',
      serving_weight_grams: 100
    });
  }
  
  // Return at least one result
  if (foods.length === 0) {
    foods.push({
      food_name: query,
      nf_calories: 100,
      nf_protein: 5,
      nf_total_carbohydrate: 10,
      nf_total_fat: 5,
      serving_qty: 1,
      serving_unit: 'serving',
      serving_weight_grams: 100
    });
  }
  
  return foods;
}