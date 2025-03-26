import React from 'react';
import { ArrowUpIcon } from '@/lib/icons';

interface WorkoutStatsProps {
  weeklyWorkouts: number;
  weeklyWorkoutsChange: number;
  totalTime: string;
  totalTimeChange: number;
}

const WorkoutStats: React.FC<WorkoutStatsProps> = ({ 
  weeklyWorkouts, 
  weeklyWorkoutsChange,
  totalTime,
  totalTimeChange
}) => {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-2">This Week</div>
        <div className="flex items-end justify-between">
          <div className="text-xl font-bold">{weeklyWorkouts} Workouts</div>
          <div className="text-[#4CAF50] text-sm flex items-center">
            <ArrowUpIcon className="w-4 h-4 mr-1" />
            {weeklyWorkoutsChange}%
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-2">Total Time</div>
        <div className="flex items-end justify-between">
          <div className="text-xl font-bold">{totalTime}</div>
          <div className="text-[#4CAF50] text-sm flex items-center">
            <ArrowUpIcon className="w-4 h-4 mr-1" />
            {totalTimeChange}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkoutStats;