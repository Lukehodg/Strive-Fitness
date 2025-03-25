import React from 'react';

interface NutrientProgress {
  current: number;
  target: number;
  percentage: number;
}

interface CalorieSummaryProps {
  caloriesConsumed: number;
  caloriesTarget: number;
  protein: NutrientProgress;
  carbs: NutrientProgress;
  fat: NutrientProgress;
}

const CalorieSummary: React.FC<CalorieSummaryProps> = ({
  caloriesConsumed,
  caloriesTarget,
  protein,
  carbs,
  fat
}) => {
  const caloriesRemaining = caloriesTarget - caloriesConsumed;

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-3">Today's Summary</h3>
      <div className="flex justify-between items-center mb-4">
        <div>
          <span className="text-gray-500 text-sm">Calories Remaining</span>
          <div className="text-2xl font-bold">{caloriesRemaining}</div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end">
            <span className="text-2xl font-bold">{caloriesConsumed.toLocaleString()}</span>
            <span className="text-gray-500 text-sm ml-1">/ {caloriesTarget.toLocaleString()}</span>
          </div>
          <span className="text-xs text-gray-500">calories consumed</span>
        </div>
      </div>
      
      <div className="bg-[#F5F5F5] rounded-lg p-3">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">Protein</div>
            <div className="flex items-baseline">
              <span className="text-lg font-bold">{protein.current}g</span>
              <span className="text-xs text-gray-500 ml-1">/ {protein.target}g</span>
            </div>
            <div className="h-1 w-full bg-gray-200 rounded-full mt-1">
              <div 
                className="h-1 bg-primary rounded-full" 
                style={{ width: `${protein.percentage}%` }} 
              />
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-1">Carbs</div>
            <div className="flex items-baseline">
              <span className="text-lg font-bold">{carbs.current}g</span>
              <span className="text-xs text-gray-500 ml-1">/ {carbs.target}g</span>
            </div>
            <div className="h-1 w-full bg-gray-200 rounded-full mt-1">
              <div 
                className="h-1 bg-[#FF5722] rounded-full" 
                style={{ width: `${carbs.percentage}%` }} 
              />
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-1">Fat</div>
            <div className="flex items-baseline">
              <span className="text-lg font-bold">{fat.current}g</span>
              <span className="text-xs text-gray-500 ml-1">/ {fat.target}g</span>
            </div>
            <div className="h-1 w-full bg-gray-200 rounded-full mt-1">
              <div 
                className="h-1 bg-[#4CAF50] rounded-full" 
                style={{ width: `${fat.percentage}%` }} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalorieSummary;
