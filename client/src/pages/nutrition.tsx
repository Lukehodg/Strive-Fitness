import React, { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { AddIcon } from '@/lib/icons';
import { Scan } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiRequest, queryClient } from '@/lib/queryClient';

import CalorieSummary from '@/components/nutrition/calorie-summary';
import TodayMeals from '@/components/nutrition/today-meals';
import AddFoodForm from '@/components/nutrition/add-food-form';

// Define interfaces for typings
interface User {
  displayName: string;
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbsTarget: number;
  dailyFatTarget: number;
  [key: string]: any;
}

interface DailyStats {
  caloriesConsumed: number;
  proteinConsumed: number;
  carbsConsumed: number;
  fatConsumed: number;
  [key: string]: any;
}

interface Food {
  name: string;
}

interface Meal {
  id: number;
  name: string;
  timestamp: string;
  calories: number;
  foods: Food[];
  protein?: number;
  carbs?: number;
  fat?: number;
  userId?: number;
}

const Nutrition = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  const [initialScanMode, setInitialScanMode] = useState(false);
  
  // Fetch user data
  const { data: userData } = useQuery<User>({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch daily stats
  const { data: dailyStats } = useQuery<DailyStats>({
    queryKey: ['/api/users/1/daily-stats'],
    staleTime: 30000, // 30 seconds
  });
  
  // Fetch meals
  const { data: meals } = useQuery<Meal[]>({
    queryKey: ['/api/users/1/meals'],
    staleTime: 30000, // 30 seconds
  });
  
  // Update user nutrition goals
  const updateUserMutation = useMutation({
    mutationFn: async (userData: Partial<User>) => {
      try {
        console.log("Making PATCH request to /api/user/1 with data:", userData);
        const response = await apiRequest('PATCH', `/api/user/1`, userData);
        
        if (!response.ok) {
          const errorData = await response.text();
          console.error("Server response error:", response.status, errorData);
          throw new Error(`Server responded with status ${response.status}: ${errorData}`);
        }
        
        const data = await response.json();
        console.log("Server response success:", data);
        return data;
      } catch (err) {
        console.error("Mutation failed:", err);
        throw err;
      }
    },
    onSuccess: (updatedUser) => {
      console.log("Mutation success, updated user:", updatedUser);
      // Update the cache with the new user data
      queryClient.setQueryData(['/api/user/1'], updatedUser);
      
      toast({
        title: "Nutrition Goals Updated",
        description: "Your nutrition goals have been successfully updated.",
      });
      
      // Update the local state
      setUser(updatedUser);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to update nutrition goals. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
      console.error("Error updating nutrition goals:", error);
    }
  });
  
  const handleAddMeal = () => {
    setInitialScanMode(false);
    setIsAddFoodOpen(true);
  };
  
  const handleScanBarcode = () => {
    setInitialScanMode(true);
    setIsAddFoodOpen(true);
  };
  
  // Handle nutrition goals update
  const handleGoalsUpdated = (newGoals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => {
    if (user) {
      console.log("Updating goals with:", {
        dailyCalorieTarget: newGoals.calories,
        dailyProteinTarget: newGoals.protein,
        dailyCarbsTarget: newGoals.carbs,
        dailyFatTarget: newGoals.fat
      });
      
      updateUserMutation.mutate({
        dailyCalorieTarget: newGoals.calories,
        dailyProteinTarget: newGoals.protein,
        dailyCarbsTarget: newGoals.carbs,
        dailyFatTarget: newGoals.fat
      });
    }
  };
  
  // Format meals data
  const formatMeals = (mealsData: any[] | undefined) => {
    if (!mealsData) return [];
    
    return mealsData.map(meal => ({
      id: meal.id,
      name: meal.name,
      time: format(new Date(meal.timestamp), 'h:mm a'),
      calories: meal.calories,
      foods: meal.foods.map((food: string) => ({ name: food }))
    }));
  };
  
  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);
  
  if (!user || !dailyStats || !meals) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh] bg-gray-900 text-white">
        <p>Loading...</p>
      </div>
    );
  }
  
  // Calculate totals and macronutrient percentages based on actual daily stats
  const proteinConsumed = dailyStats.proteinConsumed || 0;
  const proteinTarget = user.dailyProteinTarget || 180;
  const proteinPercentage = Math.min(100, Math.round((proteinConsumed / proteinTarget) * 100));
  
  const carbsConsumed = dailyStats.carbsConsumed || 0;
  const carbsTarget = user.dailyCarbsTarget || 250;
  const carbsPercentage = Math.min(100, Math.round((carbsConsumed / carbsTarget) * 100));
  
  const fatConsumed = dailyStats.fatConsumed || 0;
  const fatTarget = user.dailyFatTarget || 65;
  const fatPercentage = Math.min(100, Math.round((fatConsumed / fatTarget) * 100));
  
  return (
    <div className="p-4 space-y-6 pb-20 bg-gray-900 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-['Inter',sans-serif] text-2xl font-bold text-white">Nutrition</h2>
        <div className="flex gap-2">
          {/* Barcode scan button */}
          <Dialog open={isAddFoodOpen && initialScanMode} onOpenChange={(open) => {
            if (!open) setIsAddFoodOpen(false);
          }}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="icon"
                className="rounded-full"
                onClick={handleScanBarcode}
              >
                <Scan className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <AddFoodForm 
                onSuccess={() => setIsAddFoodOpen(false)}
                initialTab="scan"
              />
            </DialogContent>
          </Dialog>
          
          {/* Add food button */}
          <Dialog open={isAddFoodOpen && !initialScanMode} onOpenChange={(open) => {
            if (!open) setIsAddFoodOpen(false);
          }}>
            <DialogTrigger asChild>
              <Button 
                variant="default" 
                size="icon"
                className="bg-primary text-white rounded-full"
                onClick={handleAddMeal}
              >
                <AddIcon className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <AddFoodForm 
                onSuccess={() => setIsAddFoodOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      <CalorieSummary 
        caloriesConsumed={dailyStats.caloriesConsumed || 0}
        caloriesTarget={user.dailyCalorieTarget || 2500}
        protein={{
          current: proteinConsumed,
          target: proteinTarget,
          percentage: proteinPercentage
        }}
        carbs={{
          current: carbsConsumed,
          target: carbsTarget,
          percentage: carbsPercentage
        }}
        fat={{
          current: fatConsumed,
          target: fatTarget,
          percentage: fatPercentage
        }}
        onGoalsUpdated={handleGoalsUpdated}
      />
      
      <TodayMeals 
        meals={formatMeals(meals)}
        onAddMeal={handleAddMeal}
      />
    </div>
  );
};

export default Nutrition;
