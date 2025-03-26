import React from 'react';
import {
  Timer,
  Heart,
  Flame,
  ArrowRight,
  BarChart,
  TrendingUp,
  Map,
  Droplets
} from 'lucide-react';
import { format } from 'date-fns';

interface EnduranceWorkoutSummaryProps {
  workout: any;
  workoutSets: any[];
  template: any;
}

const EnduranceWorkoutSummary: React.FC<EnduranceWorkoutSummaryProps> = ({
  workout,
  workoutSets,
  template
}) => {
  if (!workout || !workoutSets || workoutSets.length === 0) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="text-center text-gray-400">No data available</div>
      </div>
    );
  }

  // Calculate total duration of workout in seconds
  const totalDurationSecs = workoutSets.reduce((total, set) => {
    return total + (set.duration || 0);
  }, 0);

  // Format total duration as hours:minutes:seconds
  const formatTotalDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  };

  // Calculate total distance in meters
  const totalDistance = workoutSets.reduce((total, set) => {
    return total + (set.distance || 0);
  }, 0);

  // Format distance for display (convert to km if > 1000m)
  const formatDistance = (meters: number): string => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    } else {
      return `${meters} m`;
    }
  };

  // Calculate total calories
  const totalCalories = workoutSets.reduce((total, set) => {
    return total + (set.calories || 0);
  }, 0);

  // Calculate average heart rate (only from sets that have heart rate data)
  const setsWithHeartRate = workoutSets.filter(set => set.heartRate);
  const avgHeartRate = setsWithHeartRate.length > 0
    ? Math.round(setsWithHeartRate.reduce((total, set) => total + (set.heartRate || 0), 0) / setsWithHeartRate.length)
    : 0;

  // Calculate average pace (min/km) from sets that have both distance and duration
  const setsWithPace = workoutSets.filter(set => set.distance && set.duration);
  let avgPace = 0;
  
  if (setsWithPace.length > 0) {
    const totalPaceTime = setsWithPace.reduce((total, set) => {
      const paceInSecs = set.duration / (set.distance / 1000);
      return total + paceInSecs;
    }, 0);
    avgPace = totalPaceTime / setsWithPace.length;
  }

  // Format pace as min:sec per km
  const formatPace = (paceSeconds: number): string => {
    if (!paceSeconds || isNaN(paceSeconds)) return '-';
    const mins = Math.floor(paceSeconds / 60);
    const secs = Math.floor(paceSeconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}/km`;
  };
  
  // Calculate total elevation gain
  const totalElevation = workoutSets.reduce((total, set) => {
    return total + (set.elevationGain || 0);
  }, 0);

  // Calculate average perceived effort
  const setsWithEffort = workoutSets.filter(set => set.perceivedEffort);
  const avgEffort = setsWithEffort.length > 0
    ? Math.round(setsWithEffort.reduce((total, set) => total + (set.perceivedEffort || 0), 0) / setsWithEffort.length)
    : 0;

  // Calculate workout start and end times
  const startTime = workout.startTime ? new Date(workout.startTime) : null;
  const endTime = workout.endTime ? new Date(workout.endTime) : null;

  // Get time of day format
  const formatTimeOfDay = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'h:mm a');
  };

  // Find whether this is a cardio workout
  const isCardioWorkout = template?.workoutType === 'cardio' || template?.workoutType === 'endurance';

  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 text-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white">{template?.name || 'Endurance Workout'}</h3>
        <div className="text-xs text-gray-400">
          {startTime && (
            <div className="flex items-center">
              <span>{format(startTime, 'MMM d, yyyy')}</span>
              {endTime && (
                <span className="flex items-center mx-2">
                  {formatTimeOfDay(startTime)} 
                  <ArrowRight size={12} className="mx-1" /> 
                  {formatTimeOfDay(endTime)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
          <div className="flex items-center text-blue-400 mb-1">
            <Timer size={16} className="mr-1" />
            <span className="text-xs font-medium">Total Time</span>
          </div>
          <div className="text-lg font-bold">{formatTotalDuration(totalDurationSecs)}</div>
        </div>
        
        {isCardioWorkout && totalDistance > 0 && (
          <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
            <div className="flex items-center text-green-400 mb-1">
              <Map size={16} className="mr-1" />
              <span className="text-xs font-medium">Distance</span>
            </div>
            <div className="text-lg font-bold">{formatDistance(totalDistance)}</div>
          </div>
        )}
        
        {totalCalories > 0 && (
          <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
            <div className="flex items-center text-orange-400 mb-1">
              <Flame size={16} className="mr-1" />
              <span className="text-xs font-medium">Calories</span>
            </div>
            <div className="text-lg font-bold">{totalCalories} kcal</div>
          </div>
        )}
        
        {avgHeartRate > 0 && (
          <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
            <div className="flex items-center text-red-400 mb-1">
              <Heart size={16} className="mr-1" />
              <span className="text-xs font-medium">Avg HR</span>
            </div>
            <div className="text-lg font-bold">{avgHeartRate} bpm</div>
          </div>
        )}
        
        {isCardioWorkout && avgPace > 0 && (
          <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
            <div className="flex items-center text-purple-400 mb-1">
              <Timer size={16} className="mr-1" />
              <span className="text-xs font-medium">Avg Pace</span>
            </div>
            <div className="text-lg font-bold">{formatPace(avgPace)}</div>
          </div>
        )}
        
        {totalElevation > 0 && (
          <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
            <div className="flex items-center text-yellow-400 mb-1">
              <TrendingUp size={16} className="mr-1" />
              <span className="text-xs font-medium">Elevation</span>
            </div>
            <div className="text-lg font-bold">{totalElevation} m</div>
          </div>
        )}
        
        {avgEffort > 0 && (
          <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
            <div className="flex items-center text-cyan-400 mb-1">
              <BarChart size={16} className="mr-1" />
              <span className="text-xs font-medium">Effort</span>
            </div>
            <div className="text-lg font-bold">{avgEffort}/10</div>
          </div>
        )}
      </div>
      
      <h4 className="text-sm font-medium text-gray-300 mb-2">Exercise Details</h4>
      <div className="space-y-3">
        {workoutSets.map((set, index) => {
          // Group sets by exerciseId to show exercise name only once
          const isFirstSetOfExercise = index === 0 || set.exerciseId !== workoutSets[index - 1].exerciseId;
          
          return (
            <React.Fragment key={set.id || index}>
              {isFirstSetOfExercise && (
                <div className="text-sm font-medium text-white mt-4 mb-2 border-t border-gray-700 pt-3">
                  {set.exerciseName || `Exercise ${set.exerciseId}`}
                </div>
              )}
              
              <div className="bg-gray-700 p-3 rounded-lg border border-gray-600">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs text-gray-400">Set {index + 1}</div>
                  <div className="text-xs font-medium bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded-full border border-blue-800">
                    {set.measurementType || 'Standard'}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  {set.distance > 0 && (
                    <div className="flex items-center">
                      <Map size={14} className="text-green-400 mr-1" />
                      <span>{formatDistance(set.distance)}</span>
                    </div>
                  )}
                  
                  {set.duration > 0 && (
                    <div className="flex items-center">
                      <Timer size={14} className="text-blue-400 mr-1" />
                      <span>{formatTotalDuration(set.duration)}</span>
                    </div>
                  )}
                  
                  {set.reps > 0 && (
                    <div className="flex items-center">
                      <Droplets size={14} className="text-indigo-400 mr-1" />
                      <span>{set.reps} reps</span>
                    </div>
                  )}
                  
                  {set.weight > 0 && (
                    <div className="flex items-center">
                      <span className="text-yellow-400 mr-1 font-bold">⦿</span>
                      <span>{set.weight} kg</span>
                    </div>
                  )}
                  
                  {set.heartRate > 0 && (
                    <div className="flex items-center">
                      <Heart size={14} className="text-red-400 mr-1" />
                      <span>{set.heartRate} bpm</span>
                    </div>
                  )}
                  
                  {set.calories > 0 && (
                    <div className="flex items-center">
                      <Flame size={14} className="text-orange-400 mr-1" />
                      <span>{set.calories} kcal</span>
                    </div>
                  )}
                </div>
                
                {set.notes && (
                  <div className="mt-2 text-xs text-gray-400 border-t border-gray-600 pt-2">
                    {set.notes}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default EnduranceWorkoutSummary;