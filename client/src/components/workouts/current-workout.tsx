import React from 'react';
import { CheckCircleIcon, CheckCircleOutlineIcon, PlayIcon } from '@/lib/icons';

interface ExerciseSet {
  id: number;
  exerciseId: number;
  exerciseName: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  weight: number;
  isCompleted: boolean;
}

interface CurrentWorkoutProps {
  workoutName: string;
  exercises: ExerciseSet[];
  onContinueWorkout: () => void;
}

const CurrentWorkout: React.FC<CurrentWorkoutProps> = ({ 
  workoutName, 
  exercises,
  onContinueWorkout
}) => {
  return (
    <div className="bg-gray-800 rounded-xl shadow-sm p-4 border border-gray-700">
      <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-4 text-white">Current Workout</h3>
      <div className="bg-gray-900 border border-primary/20 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-medium text-primary">{workoutName}</h4>
          <span className="bg-primary/20 text-primary text-xs font-medium px-2 py-1 rounded">In Progress</span>
        </div>
        
        <div className="space-y-3 mb-4">
          {exercises.map((exercise) => (
            <div key={exercise.id} className="flex justify-between items-center pb-2 border-b border-gray-700">
              <div>
                <h5 className="font-medium text-white">{exercise.exerciseName}</h5>
                <div className="flex text-xs text-gray-400 mt-1">
                  <span className="mr-2">{exercise.sets} sets</span>
                  <span className="mr-2">{exercise.repsMin}-{exercise.repsMax} reps</span>
                  <span>{exercise.weight}kg</span>
                </div>
              </div>
              <div className="flex items-center">
                {exercise.isCompleted ? (
                  <CheckCircleIcon className="text-[#4CAF50] w-5 h-5" />
                ) : (
                  <CheckCircleOutlineIcon className="text-gray-500 w-5 h-5" />
                )}
              </div>
            </div>
          ))}
        </div>
        
        <button 
          className="w-full bg-primary text-white py-3 rounded-lg font-medium flex items-center justify-center"
          onClick={onContinueWorkout}
        >
          <PlayIcon className="mr-2 w-5 h-5" />
          Continue Workout
        </button>
      </div>
    </div>
  );
};

export default CurrentWorkout;
