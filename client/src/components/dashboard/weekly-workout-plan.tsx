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
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
}

const WeeklyWorkoutPlan: React.FC<WeeklyWorkoutPlanProps> = ({ 
  workoutPlan, 
  onViewAll, 
  onDateSelect,
  selectedDate 
}) => {
  return (
    <div className="bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold text-white">Weekly Workout Plan</h3>
        <span className="text-primary text-sm cursor-pointer hover:text-primary/80" onClick={onViewAll}>View All</span>
      </div>
      
      <div className="flex space-x-3 overflow-x-auto pb-2">
        {workoutPlan.map((day, index) => {
          const isSelected = format(day.date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
          return (
            <div 
              key={index} 
              className="flex-shrink-0 w-16 flex flex-col items-center cursor-pointer"
              onClick={() => onDateSelect(day.date)}
            >
              <div className="text-xs text-gray-400 mb-1">{day.day}</div>
              <div 
                className={`${isSelected ? 'bg-primary text-white' : day.isToday ? 'bg-primary/70 text-white' : 'bg-gray-900 border border-gray-700'} 
                  w-10 h-10 rounded-full flex items-center justify-center font-medium text-white transition-colors hover:bg-primary/80`}
              >
                {format(day.date, 'd')}
              </div>
              <div className="text-xs font-medium mt-1 truncate w-full text-center text-white">
                {day.workout || 'Rest'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WeeklyWorkoutPlan;
