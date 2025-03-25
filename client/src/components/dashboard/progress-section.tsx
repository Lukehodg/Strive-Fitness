import React from 'react';
import ProgressCircle from '@/components/ui/progress-circle';

interface ProgressSectionProps {
  caloriesConsumed: number;
  caloriesTarget: number;
  stepsCount: number;
  stepsTarget: number;
  waterIntake: number;
  waterTarget: number;
}

const ProgressSection: React.FC<ProgressSectionProps> = ({
  caloriesConsumed,
  caloriesTarget,
  stepsCount,
  stepsTarget,
  waterIntake,
  waterTarget
}) => {
  // Calculate progress percentages
  const caloriesPercentage = Math.round((caloriesConsumed / caloriesTarget) * 100);
  const stepsPercentage = Math.round((stepsCount / stepsTarget) * 100);
  const waterPercentage = Math.round((waterIntake / waterTarget) * 100);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-2">Today's Progress</h3>
      <div className="flex justify-between">
        <ProgressCircle
          progress={caloriesPercentage}
          color="#FF5722"
          label="Calories"
          value={caloriesConsumed.toLocaleString()}
          total={caloriesTarget.toLocaleString()}
        />
        
        <ProgressCircle
          progress={stepsPercentage}
          color="#3F51B5"
          label="Steps"
          value={stepsCount.toLocaleString()}
          total={stepsTarget.toLocaleString()}
        />
        
        <ProgressCircle
          progress={waterPercentage}
          color="#03A9F4"
          label="Water"
          value={`${waterIntake.toFixed(1)}`}
          total={`${waterTarget}L`}
        />
      </div>
    </div>
  );
};

export default ProgressSection;
