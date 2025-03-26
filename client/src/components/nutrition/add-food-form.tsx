import React, { useState, useEffect } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Scan, Camera } from 'lucide-react';
import BarcodeScanner from './barcode-scanner';

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
  initialTab?: 'manual' | 'search' | 'scan';
}

type FoodResult = {
  food_name: string;
  nf_protein: number;
  nf_total_carbohydrate: number;
  nf_total_fat: number;
  serving_qty: number;
  serving_unit: string;
  image?: string;
};

const AddFoodForm: React.FC<AddFoodFormProps> = ({ onSuccess, defaultMealName = "Breakfast", initialTab = 'manual' }) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<FoodResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>(initialTab);
  const [isScannerOpen, setIsScannerOpen] = useState(initialTab === 'scan');
  const [servingUnit, setServingUnit] = useState<string>('g');
  
  // Auto-open scanner when scan tab is selected
  useEffect(() => {
    if (selectedTab === 'scan') {
      setIsScannerOpen(true);
    }
  }, [selectedTab]);

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
        timestamp: new Date(), // Send the actual Date object, not a string
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

  // Search for food using our nutrition API
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
      // Call our API endpoint that accesses Nutritionix
      const response = await fetch(`/api/nutrition/search?q=${encodeURIComponent(searchTerm)}`);
      
      if (!response.ok) {
        throw new Error(`Error searching for food: ${response.statusText}`);
      }
      
      // Check if we're using fallback data
      const isFallback = response.headers.get('X-Using-Fallback') === 'true';
      
      if (isFallback) {
        toast({
          title: 'Using Fallback Data',
          description: 'Nutritional data is approximate. Add API key for accurate data.',
        });
      }
      
      const foods = await response.json();
      
      if (foods && Array.isArray(foods)) {
        setSearchResults(foods.map(food => ({
          food_name: food.food_name,
          nf_protein: food.nf_protein,
          nf_total_carbohydrate: food.nf_total_carbohydrate,
          nf_total_fat: food.nf_total_fat,
          serving_qty: food.serving_qty,
          serving_unit: food.serving_unit,
          image: food.image
        })));
      } else {
        setSearchResults([]);
        toast({
          title: 'No Results',
          description: 'No foods found for your search term.',
        });
      }
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
    form.setValue('quantity', food.serving_qty || 1);
    
    // Store the serving unit in a ref to display in the quantity field
    if (food.serving_unit) {
      setServingUnit(food.serving_unit);
    }
    
    setSelectedTab('manual');
    
    // Show a success toast with nutrition info summary
    toast({
      title: 'Food Selected',
      description: `${food.food_name} (P: ${food.nf_protein}g, C: ${food.nf_total_carbohydrate}g, F: ${food.nf_total_fat}g)`,
    });
  };
  
  // Handle barcode scanning
  const handleBarcodeScan = async (barcode: string) => {
    setIsScannerOpen(false);
    setIsSearching(true);
    
    try {
      const response = await fetch(`/api/nutrition/barcode/${barcode}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: 'Product Not Found',
            description: `No product found with barcode ${barcode}`,
            variant: 'destructive',
          });
        } else {
          throw new Error(`Error fetching product: ${response.statusText}`);
        }
        return;
      }
      
      const product = await response.json();
      
      if (product) {
        toast({
          title: 'Product Found',
          description: `Found: ${product.food_name}`,
        });
        
        // Select the food
        selectFood(product);
      }
    } catch (error) {
      console.error('Error scanning barcode:', error);
      toast({
        title: 'Scan Error',
        description: 'Failed to get product information. Please try again or enter manually.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="font-semibold text-lg mb-4">Add Food</h3>
      
      <Tabs defaultValue="manual" value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
          <TabsTrigger value="search">Search Food</TabsTrigger>
          <TabsTrigger value="scan">Scan Barcode</TabsTrigger>
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
                      <FormLabel className="flex items-center">
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded mr-2">P</span> 
                        Protein (g)
                      </FormLabel>
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
                      <FormLabel className="flex items-center">
                        <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded mr-2">C</span> 
                        Carbs (g)
                      </FormLabel>
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
                      <FormLabel className="flex items-center">
                        <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded mr-2">F</span> 
                        Fat (g)
                      </FormLabel>
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
                    <FormLabel>Quantity ({servingUnit})</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input type="number" step="0.1" {...field} />
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 text-sm">{servingUnit}</span>
                        </div>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="space-y-2">
                <FormLabel>Meal Type</FormLabel>
                <div className="grid grid-cols-2 gap-2">
                  <RadioGroup
                    value={form.watch('mealName')}
                    onValueChange={(value) => form.setValue('mealName', value)}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <div 
                        className={`flex items-center justify-center rounded-md border-2 p-3 cursor-pointer ${
                          form.watch('mealName') === 'Breakfast' 
                            ? 'border-primary bg-primary/10' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => form.setValue('mealName', 'Breakfast')}
                      >
                        <div className="text-center">
                          <div className="text-xl mb-1">🍳</div>
                          <div className="text-sm font-medium">Breakfast</div>
                        </div>
                      </div>
                      
                      <div 
                        className={`flex items-center justify-center rounded-md border-2 p-3 cursor-pointer ${
                          form.watch('mealName') === 'Lunch' 
                            ? 'border-primary bg-primary/10' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => form.setValue('mealName', 'Lunch')}
                      >
                        <div className="text-center">
                          <div className="text-xl mb-1">🥪</div>
                          <div className="text-sm font-medium">Lunch</div>
                        </div>
                      </div>
                      
                      <div 
                        className={`flex items-center justify-center rounded-md border-2 p-3 cursor-pointer ${
                          form.watch('mealName') === 'Dinner' 
                            ? 'border-primary bg-primary/10' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => form.setValue('mealName', 'Dinner')}
                      >
                        <div className="text-center">
                          <div className="text-xl mb-1">🍽️</div>
                          <div className="text-sm font-medium">Dinner</div>
                        </div>
                      </div>
                      
                      <div 
                        className={`flex items-center justify-center rounded-md border-2 p-3 cursor-pointer ${
                          form.watch('mealName') === 'Snack' 
                            ? 'border-primary bg-primary/10' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => form.setValue('mealName', 'Snack')}
                      >
                        <div className="text-center">
                          <div className="text-xl mb-1">🍎</div>
                          <div className="text-sm font-medium">Snack</div>
                        </div>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
              
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
                      className="bg-[#F5F5F5] p-3 rounded-lg cursor-pointer hover:bg-gray-200 flex gap-3"
                      onClick={() => selectFood(food)}
                    >
                      {food.image && (
                        <div className="flex-shrink-0 w-12 h-12">
                          <img 
                            src={food.image} 
                            alt={food.food_name} 
                            className="w-full h-full object-cover rounded" 
                          />
                        </div>
                      )}
                      <div className="flex-grow">
                        <div className="font-medium">{food.food_name}</div>
                        <div className="text-sm text-gray-500">
                          {food.serving_qty} {food.serving_unit} | 
                          P: {food.nf_protein}g | 
                          C: {food.nf_total_carbohydrate}g | 
                          F: {food.nf_total_fat}g
                        </div>
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
              Powered by Nutritionix API (requires API key)
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="scan">
          <div className="space-y-4">
            <div className="text-center p-4">
              <p className="mb-4">Scan a food product barcode to get nutritional information</p>
              
              <Button 
                onClick={() => setIsScannerOpen(true)} 
                className="w-full flex items-center justify-center gap-2"
                disabled={isSearching}
              >
                {isSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Scan className="h-5 w-5" />
                    <span>Open Scanner</span>
                  </>
                )}
              </Button>
              
              <div className="mt-4 text-xs text-gray-500 text-center">
                Powered by Open Food Facts database
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Barcode Scanner Modal */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Scan Barcode</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsScannerOpen(false)}
                className="h-8 w-8 p-0"
              >
                &times;
              </Button>
            </div>
            
            <BarcodeScanner 
              onScan={handleBarcodeScan} 
              onClose={() => setIsScannerOpen(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AddFoodForm;