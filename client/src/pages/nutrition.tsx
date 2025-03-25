import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { AddIcon } from '@/lib/icons';

import CalorieSummary from '@/components/nutrition/calorie-summary';
import TodayMeals from '@/components/nutrition/today-meals';

const Nutrition = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  
  // Fetch user data
  const { data: userData } = useQuery({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch daily stats
  const { data: dailyStats } = useQuery({
    queryKey: ['/api/users/1/daily-stats'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch meals
  const { data: meals } = useQuery({
    queryKey: ['/api/users/1/meals'],
    staleTime: 60000, // 1 minute
  });
  
  const handleAddMeal = () => {
    toast({
      title: "Add Meal",
      description: "This feature is coming soon!",
    });
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
  
  // Calculate nutrient percentages
  const proteinConsumed = 125;
  const proteinTarget = 180;
  const proteinPercentage = Math.round((proteinConsumed / proteinTarget) * 100);
  
  const carbsConsumed = 195;
  const carbsTarget = 250;
  const carbsPercentage = Math.round((carbsConsumed / carbsTarget) * 100);
  
  const fatConsumed = 48;
  const fatTarget = 65;
  const fatPercentage = Math.round((fatConsumed / fatTarget) * 100);
  
  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-['Inter',sans-serif] text-2xl font-bold">Nutrition</h2>
        <button 
          className="bg-primary text-white rounded-full p-2"
          onClick={handleAddMeal}
        >
          <AddIcon className="w-6 h-6" />
        </button>
      </div>
      
      <CalorieSummary 
        caloriesConsumed={dailyStats.caloriesConsumed}
        caloriesTarget={user.dailyCalorieTarget}
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
