import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface ActiveWorkoutProps {
  workoutId: number;
}

const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({ workoutId }) => {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [timer, setTimer] = useState<number>(0);
  const [timerActive, setTimerActive] = useState<boolean>(true);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState<number>(0);
  const [exerciseSets, setExerciseSets] = useState<Map<number, any[]>>(new Map());
  
  // Fetch workout data
  const { data: workout, isLoading: isLoadingWorkout } = useQuery({
    queryKey: [`/api/completed-workouts/${workoutId}`],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch workout template data
  const { data: workoutTemplate, isLoading: isLoadingTemplate } = useQuery({
    queryKey: [`/api/workout-templates/${workout?.workoutTemplateId}`],
    staleTime: 60000, // 1 minute
    enabled: !!workout?.workoutTemplateId,
  });
  
  // Fetch template exercises
  const { data: templateExercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: [`/api/workout-templates/${workout?.workoutTemplateId}/exercises`],
    staleTime: 60000, // 1 minute
    enabled: !!workout?.workoutTemplateId,
  });
  
  // Fetch exercise details
  const { data: exercises } = useQuery({
    queryKey: ['/api/exercises'],
    staleTime: 60000, // 1 minute
  });
  
  // Start timer when component loads
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (timerActive) {
      interval = setInterval(() => {
        setTimer((prevTimer) => prevTimer + 1);
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerActive]);
  
  // Format timer display
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Initialize exercise sets when template exercises load
  useEffect(() => {
    if (templateExercises && templateExercises.length > 0) {
      const setsMap = new Map<number, any[]>();
      
      templateExercises.forEach((exercise: any) => {
        const sets = Array(exercise.sets).fill(null).map((_, index) => ({
          setNumber: index + 1,
          weight: 0,
          reps: 0,
          type: index === 0 ? 'warmup' : 'working',
          isCompleted: false
        }));
        
        setsMap.set(exercise.exerciseId, sets);
      });
      
      setExerciseSets(setsMap);
    }
  }, [templateExercises]);
  
  // Create workout set mutation
  const createSetMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('POST', '/api/workout-sets', {
        completedWorkoutId: workoutId,
        exerciseId: data.exerciseId,
        weight: data.weight,
        reps: data.reps,
        rpe: data.rpe || 7,
        setNumber: data.setNumber,
        setType: data.type,
        isCompleted: true,
        timestamp: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/completed-workouts/${workoutId}/sets`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save workout set",
        variant: "destructive"
      });
      console.error(error);
    }
  });
  
  // Update workout completion mutation
  const completeWorkoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('PATCH', `/api/completed-workouts/${workoutId}`, {
        endTime: new Date().toISOString(),
        isCompleted: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/completed-workouts'] });
      toast({
        title: "Workout Complete",
        description: "Great job! Your workout has been saved."
      });
      setLocation('/workouts');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to complete workout",
        variant: "destructive"
      });
      console.error(error);
    }
  });
  
  // Update set data
  const updateSetValue = (exerciseId: number, setIndex: number, field: string, value: number | string) => {
    const currentSets = exerciseSets.get(exerciseId) || [];
    const updatedSets = [...currentSets];
    updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: value };
    
    const newSetsMap = new Map(exerciseSets);
    newSetsMap.set(exerciseId, updatedSets);
    setExerciseSets(newSetsMap);
  };
  
  // Save completed set
  const saveSet = (exerciseId: number, setIndex: number) => {
    const currentSets = exerciseSets.get(exerciseId) || [];
    const set = currentSets[setIndex];
    
    if (!set.weight || !set.reps) {
      toast({
        title: "Missing Data",
        description: "Please enter weight and reps",
        variant: "destructive"
      });
      return;
    }
    
    createSetMutation.mutate({
      exerciseId,
      weight: parseFloat(set.weight),
      reps: parseInt(set.reps),
      setNumber: set.setNumber,
      type: set.type
    });
    
    // Mark as completed
    updateSetValue(exerciseId, setIndex, 'isCompleted', true);
    
    toast({
      title: "Set Saved",
      description: `${set.weight}kg x ${set.reps} reps`,
    });
  };
  
  // Toggle set type between warmup and working
  const toggleSetType = (exerciseId: number, setIndex: number) => {
    const currentSets = exerciseSets.get(exerciseId) || [];
    const currentType = currentSets[setIndex].type;
    const newType = currentType === 'warmup' ? 'working' : 'warmup';
    
    updateSetValue(exerciseId, setIndex, 'type', newType);
  };
  
  // Move to next exercise
  const moveToNextExercise = () => {
    if (templateExercises && currentExerciseIndex < templateExercises.length - 1) {
      setCurrentExerciseIndex(currentExerciseIndex + 1);
      window.scrollTo(0, 0);
    }
  };
  
  // Move to previous exercise
  const moveToPrevExercise = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(currentExerciseIndex - 1);
      window.scrollTo(0, 0);
    }
  };
  
  // Complete workout
  const handleFinishWorkout = () => {
    // Check if all sets are completed
    let allSetsCompleted = true;
    exerciseSets.forEach((sets) => {
      if (sets.some(set => !set.isCompleted)) {
        allSetsCompleted = false;
      }
    });
    
    if (!allSetsCompleted) {
      if (confirm("You have uncompleted sets. Are you sure you want to finish the workout?")) {
        completeWorkoutMutation.mutate();
      }
    } else {
      completeWorkoutMutation.mutate();
    }
    
    setTimerActive(false);
  };
  
  // Cancel workout
  const handleCancelWorkout = () => {
    if (confirm("Are you sure you want to cancel this workout? Your progress will not be saved.")) {
      setLocation('/workouts');
    }
  };
  
  if (isLoadingWorkout || isLoadingTemplate || isLoadingExercises) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading workout...</p>
      </div>
    );
  }
  
  if (!workout || !workoutTemplate || !templateExercises || templateExercises.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Workout Not Found</h2>
        <button 
          className="bg-primary text-white py-2 px-4 rounded-lg"
          onClick={() => setLocation('/workouts')}
        >
          Back to Workouts
        </button>
      </div>
    );
  }
  
  const currentTemplateExercise = templateExercises[currentExerciseIndex];
  const currentExercise = exercises?.find((e: any) => e.id === currentTemplateExercise.exerciseId);
  const currentSets = exerciseSets.get(currentTemplateExercise.exerciseId) || [];
  const startTime = new Date(workout.startTime);
  
  return (
    <div className="p-4 space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-['Inter',sans-serif] text-xl font-bold">{workoutTemplate.name}</h2>
          <div className="text-lg font-medium">{formatTime(timer)}</div>
        </div>
        <div className="text-sm text-gray-500">
          Started at {format(startTime, 'h:mm a')} · {templateExercises.length} exercises
        </div>
        <div className="mt-2 h-1 w-full bg-gray-200 rounded-full">
          <div 
            className="h-1 bg-primary rounded-full" 
            style={{ 
              width: `${((currentExerciseIndex + 1) / templateExercises.length) * 100}%` 
            }} 
          />
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-['Inter',sans-serif] text-lg font-medium">{currentExercise?.name || 'Exercise'}</h3>
            <p className="text-sm text-gray-500">{currentExercise?.muscleGroup || 'Muscle Group'}</p>
          </div>
          <div className="bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full">
            {currentExerciseIndex + 1} / {templateExercises.length}
          </div>
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">Sets</h4>
            <div className="text-sm text-gray-500">
              {currentSets.filter(s => s.isCompleted).length} / {currentSets.length} completed
            </div>
          </div>
          
          <div className="space-y-4">
            {currentSets.map((set, setIndex) => (
              <div 
                key={setIndex}
                className={`border rounded-lg p-3 ${
                  set.isCompleted 
                    ? 'border-green-200 bg-green-50' 
                    : 'border-gray-200'
                } ${
                  set.type === 'warmup'
                    ? 'border-yellow-200 bg-yellow-50'
                    : ''
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <h5 className="font-medium">Set {set.setNumber}</h5>
                  <button 
                    className={`text-xs px-2 py-1 rounded ${
                      set.type === 'warmup'
                        ? 'bg-yellow-100 text-yellow-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}
                    onClick={() => toggleSetType(currentTemplateExercise.exerciseId, setIndex)}
                    disabled={set.isCompleted}
                  >
                    {set.type === 'warmup' ? 'Warm-up' : 'Working'}
                  </button>
                </div>
                
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Weight (kg)</label>
                    <input 
                      type="number" 
                      value={set.weight || ''} 
                      onChange={(e) => updateSetValue(
                        currentTemplateExercise.exerciseId, 
                        setIndex, 
                        'weight', 
                        e.target.value
                      )}
                      disabled={set.isCompleted}
                      className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-2 w-full text-center" 
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Reps</label>
                    <input 
                      type="number" 
                      value={set.reps || ''} 
                      onChange={(e) => updateSetValue(
                        currentTemplateExercise.exerciseId, 
                        setIndex, 
                        'reps', 
                        e.target.value
                      )}
                      disabled={set.isCompleted}
                      className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-2 w-full text-center" 
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Action</label>
                    {!set.isCompleted ? (
                      <button 
                        className="bg-primary text-white w-full py-2 rounded-lg text-sm"
                        onClick={() => saveSet(currentTemplateExercise.exerciseId, setIndex)}
                      >
                        Save
                      </button>
                    ) : (
                      <button 
                        className="bg-green-500 text-white w-full py-2 rounded-lg text-sm"
                        disabled
                      >
                        Completed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <button 
            className={`py-3 rounded-lg font-medium border ${
              currentExerciseIndex === 0 
                ? 'bg-gray-100 text-gray-400 border-gray-200' 
                : 'bg-white text-gray-700 border-gray-300'
            }`}
            onClick={moveToPrevExercise}
            disabled={currentExerciseIndex === 0}
          >
            Previous
          </button>
          <button 
            className={`py-3 rounded-lg font-medium ${
              currentExerciseIndex === templateExercises.length - 1 
                ? 'bg-primary text-white' 
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
            onClick={currentExerciseIndex === templateExercises.length - 1 
              ? handleFinishWorkout 
              : moveToNextExercise
            }
          >
            {currentExerciseIndex === templateExercises.length - 1 
              ? 'Finish Workout' 
              : 'Next Exercise'
            }
          </button>
        </div>
      </div>
      
      <div className="flex justify-center">
        <button 
          className="text-red-500 text-sm"
          onClick={handleCancelWorkout}
        >
          Cancel Workout
        </button>
      </div>
    </div>
  );
};

export default ActiveWorkout;