import React from 'react';
import { format, addDays } from 'date-fns';

interface WorkoutDay {
  date: Date;
  day: string;
  workout: string | null;
  isToday: boolean;
}

interface WeeklyWorkoutPlanProps {
  workoutPlan: WorkoutDay[];
  onViewAll: () => void;
}

const WeeklyWorkoutPlan: React.FC<WeeklyWorkoutPlanProps> = ({ workoutPlan, onViewAll }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold">Weekly Workout Plan</h3>
        <span className="text-primary text-sm cursor-pointer" onClick={onViewAll}>View All</span>
      </div>
      
      <div className="flex space-x-3 overflow-x-auto pb-2">
        {workoutPlan.map((day, index) => (
          <div key={index} className="flex-shrink-0 w-16 flex flex-col items-center">
            <div className="text-xs text-gray-500 mb-1">{day.day}</div>
            <div 
              className={`${day.isToday ? 'bg-primary text-white' : 'bg-[#F5F5F5] border border-[#E0E0E0]'} 
                w-10 h-10 rounded-full flex items-center justify-center font-medium`}
            >
              {format(day.date, 'd')}
            </div>
            <div className="text-xs font-medium mt-1 truncate w-full text-center">
              {day.workout || 'Rest'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WeeklyWorkoutPlan;
