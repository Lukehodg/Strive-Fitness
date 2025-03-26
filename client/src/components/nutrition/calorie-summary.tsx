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
    <div className="bg-gray-800 rounded-xl shadow-sm p-4 mb-6 border border-gray-700">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-3 text-white">Today's Summary</h3>
      <div className="flex justify-between items-center mb-4">
        <div>
          <span className="text-gray-400 text-sm">Calories Remaining</span>
          <div className="text-2xl font-bold text-white">{caloriesRemaining}</div>
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end">
            <span className="text-2xl font-bold text-white">{caloriesConsumed.toLocaleString()}</span>
            <span className="text-gray-400 text-sm ml-1">/ {caloriesTarget.toLocaleString()}</span>
          </div>
          <span className="text-xs text-gray-400">calories consumed</span>
        </div>
      </div>
      
      <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-gray-400 mb-1">Protein</div>
            <div className="flex items-baseline">
              <span className="text-lg font-bold text-white">{protein.current}g</span>
              <span className="text-xs text-gray-400 ml-1">/ {protein.target}g</span>
            </div>
            <div className="h-1 w-full bg-gray-700 rounded-full mt-1">
              <div 
                className="h-1 bg-primary rounded-full" 
                style={{ width: `${protein.percentage}%` }} 
              />
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-400 mb-1">Carbs</div>
            <div className="flex items-baseline">
              <span className="text-lg font-bold text-white">{carbs.current}g</span>
              <span className="text-xs text-gray-400 ml-1">/ {carbs.target}g</span>
            </div>
            <div className="h-1 w-full bg-gray-700 rounded-full mt-1">
              <div 
                className="h-1 bg-[#FF5722] rounded-full" 
                style={{ width: `${carbs.percentage}%` }} 
              />
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-400 mb-1">Fat</div>
            <div className="flex items-baseline">
              <span className="text-lg font-bold text-white">{fat.current}g</span>
              <span className="text-xs text-gray-400 ml-1">/ {fat.target}g</span>
            </div>
            <div className="h-1 w-full bg-gray-700 rounded-full mt-1">
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
