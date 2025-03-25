import React from 'react';

interface Food {
  name: string;
}

interface Meal {
  id: number;
  name: string;
  time: string;
  calories: number;
  foods: Food[];
}

interface TodayMealsProps {
  meals: Meal[];
  onAddMeal: () => void;
}

const TodayMeals: React.FC<TodayMealsProps> = ({ meals, onAddMeal }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold">Today's Meals</h3>
        <span className="text-primary text-sm cursor-pointer" onClick={onAddMeal}>Add Meal</span>
      </div>
      
      {meals.map((meal) => (
        <div key={meal.id} className="bg-[#F5F5F5] rounded-lg p-3 mb-3 last:mb-0">
          <div className="flex justify-between mb-2">
            <h4 className="font-medium">{meal.name}</h4>
            <span className="text-sm text-gray-500">{meal.time} · {meal.calories} cal</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {meal.foods.map((food, index) => (
              <span key={index} className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
                {food.name}
              </span>
            ))}
          </div>
        </div>
      ))}
      
      {meals.length === 0 && (
        <div className="bg-[#F5F5F5] rounded-lg p-4 text-center">
          <p className="text-gray-500">No meals recorded today</p>
          <button 
            className="mt-2 bg-primary text-white text-sm px-4 py-2 rounded-lg"
            onClick={onAddMeal}
          >
            Add Your First Meal
          </button>
        </div>
      )}
    </div>
  );
};

export default TodayMeals;
