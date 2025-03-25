import React, { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { format } from 'date-fns';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';

// Define the form schema
const foodSchema = z.object({
  name: z.string().min(1, "Food name is required"),
  protein: z.coerce.number().min(0, "Protein must be a positive number"),
  carbs: z.coerce.number().min(0, "Carbs must be a positive number"),
  fat: z.coerce.number().min(0, "Fat must be a positive number"),
  quantity: z.coerce.number().min(0.1, "Quantity must be greater than 0"),
  mealName: z.string().min(1, "Meal name is required"),
});

interface AddFoodFormProps {
  onSuccess: () => void;
  defaultMealName?: string;
}

type FoodResult = {
  food_name: string;
  nf_protein: number;
  nf_total_carbohydrate: number;
  nf_total_fat: number;
  serving_qty: number;
  serving_unit: string;
};

const AddFoodForm: React.FC<AddFoodFormProps> = ({ onSuccess, defaultMealName = "Breakfast" }) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>('manual');

  // Initialize the form
  const form = useForm<z.infer<typeof foodSchema>>({
    resolver: zodResolver(foodSchema),
    defaultValues: {
      name: '',
      protein: 0,
      carbs: 0,
      fat: 0,
      quantity: 1,
      mealName: defaultMealName,
    },
  });

  const { formState, handleSubmit } = form;
  const { isSubmitting } = formState;

  // Calculate calories based on macros
  const calculateCalories = (protein: number, carbs: number, fat: number): number => {
    return protein * 4 + carbs * 4 + fat * 9;
  };

  // Handle form submission
  const onSubmit = async (data: z.infer<typeof foodSchema>) => {
    try {
      // Calculate total calories
      const calories = calculateCalories(data.protein, data.carbs, data.fat);
      
      const meal = {
        userId: 1, // In a real app, this would come from user context
        name: data.mealName,
        timestamp: new Date().toISOString(),
        calories: Math.round(calories),
        protein: data.protein,
        carbs: data.carbs,
        fat: data.fat,
        foods: [data.name],
      };
      
      await apiRequest('POST', '/api/meals', meal);
      
      toast({
        title: 'Food Added',
        description: `${data.name} has been added to your ${data.mealName}`,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/meals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/daily-stats'] });
      
      onSuccess();
    } catch (error) {
      console.error('Error adding food:', error);
      toast({
        title: 'Error',
        description: 'Failed to add food. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Search for food using Nutritionix API (to be implemented)
  const searchFood = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: 'Enter a Food',
        description: 'Please enter a food to search for',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSearching(true);
    
    try {
      // This would need your Nutritionix API key
      toast({
        title: 'API Key Required',
        description: 'MyFitnessPal API integration requires an API key',
      });
      
      // Simulated results for demo
      const mockResults: FoodResult[] = [
        {
          food_name: 'Chicken Breast',
          nf_protein: 26,
          nf_total_carbohydrate: 0,
          nf_total_fat: 3.6,
          serving_qty: 100,
          serving_unit: 'g'
        },
        {
          food_name: 'Brown Rice',
          nf_protein: 2.6,
          nf_total_carbohydrate: 23,
          nf_total_fat: 0.9,
          serving_qty: 100,
          serving_unit: 'g'
        }
      ];
      
      setSearchResults(mockResults);
    } catch (error) {
      console.error('Error searching for food:', error);
      toast({
        title: 'Search Error',
        description: 'Failed to search for food. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Select a food from search results
  const selectFood = (food: FoodResult) => {
    form.setValue('name', food.food_name);
    form.setValue('protein', food.nf_protein);
    form.setValue('carbs', food.nf_total_carbohydrate);
    form.setValue('fat', food.nf_total_fat);
    form.setValue('quantity', 1);
    setSelectedTab('manual');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-semibold text-lg mb-4">Add Food</h3>
      
      <Tabs defaultValue="manual" value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="search">Search Food</TabsTrigger>
        </TabsList>
        
        <TabsContent value="manual">
          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Food Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Chicken Breast" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name="protein"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Protein (g)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="carbs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Carbs (g)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="fat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fat (g)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="mealName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meal</FormLabel>
                    <FormControl>
                      <select 
                        className="w-full bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-2"
                        {...field}
                      >
                        <option value="Breakfast">Breakfast</option>
                        <option value="Lunch">Lunch</option>
                        <option value="Dinner">Dinner</option>
                        <option value="Snack">Snack</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="bg-[#F5F5F5] p-3 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Calculated Calories</div>
                <div className="text-xl font-bold">
                  {calculateCalories(
                    form.watch('protein') || 0,
                    form.watch('carbs') || 0,
                    form.watch('fat') || 0
                  )} cal
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : 'Add Food'}
              </Button>
            </form>
          </Form>
        </TabsContent>
        
        <TabsContent value="search">
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search for a food..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button onClick={searchFood} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : 'Search'}
              </Button>
            </div>
            
            <div className="max-h-60 overflow-y-auto">
              {searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((food, index) => (
                    <div 
                      key={index} 
                      className="bg-[#F5F5F5] p-3 rounded-lg cursor-pointer hover:bg-gray-200"
                      onClick={() => selectFood(food)}
                    >
                      <div className="font-medium">{food.food_name}</div>
                      <div className="text-sm text-gray-500">
                        {food.serving_qty} {food.serving_unit} | 
                        P: {food.nf_protein}g | 
                        C: {food.nf_total_carbohydrate}g | 
                        F: {food.nf_total_fat}g
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-8">
                  {isSearching ? 'Searching...' : 'Search results will appear here'}
                </div>
              )}
            </div>
            
            <div className="text-xs text-gray-500 text-center">
              Powered by MyFitnessPal API (requires API key)
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AddFoodForm;