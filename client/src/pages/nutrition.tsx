import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { AddIcon } from '@/lib/icons';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

import CalorieSummary from '@/components/nutrition/calorie-summary';
import TodayMeals from '@/components/nutrition/today-meals';
import AddFoodForm from '@/components/nutrition/add-food-form';

const Nutrition = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [isAddFoodOpen, setIsAddFoodOpen] = useState(false);
  
  // Fetch user data
  const { data: userData } = useQuery({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch daily stats
  const { data: dailyStats } = useQuery({
    queryKey: ['/api/users/1/daily-stats'],
    staleTime: 30000, // 30 seconds
  });
  
  // Fetch meals
  const { data: meals } = useQuery({
    queryKey: ['/api/users/1/meals'],
    staleTime: 30000, // 30 seconds
  });
  
  const handleAddMeal = () => {
    setIsAddFoodOpen(true);
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
      <div className="p-4 flex items-center justify-center h-[90vh]">
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
    <div className="p-4 space-y-6 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-['Inter',sans-serif] text-2xl font-bold">Nutrition</h2>
        <Dialog open={isAddFoodOpen} onOpenChange={setIsAddFoodOpen}>
          <DialogTrigger asChild>
            <button 
              className="bg-primary text-white rounded-full p-2"
              onClick={handleAddMeal}
            >
              <AddIcon className="w-6 h-6" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <AddFoodForm 
              onSuccess={() => setIsAddFoodOpen(false)}
            />
          </DialogContent>
        </Dialog>
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
      />
      
      <TodayMeals 
        meals={formatMeals(meals)}
        onAddMeal={handleAddMeal}
      />
    </div>
  );
};

export default Nutrition;
