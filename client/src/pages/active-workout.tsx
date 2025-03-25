import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { 
  Timer as TimerIcon, 
  Plus, 
  Minus, 
  Flame as FireIcon,
  Dumbbell,
  ChevronDown, 
  ChevronUp
} from 'lucide-react';

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
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [restTimerActive, setRestTimerActive] = useState<boolean>(false);
  const [showAllExercises, setShowAllExercises] = useState<boolean>(false);
  const restTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fetch workout data
  const { data: workout, isLoading: isLoadingWorkout } = useQuery({
    queryKey: ['/api/completed-workouts', workoutId],
    queryFn: async () => {
      const data = await apiRequest('GET', `/api/completed-workouts/${workoutId}`);
      return data;
    },
    staleTime: 60000, // 1 minute
  });
  
  // Fetch workout template data
  const { data: workoutTemplate, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['/api/workout-templates', workout?.workoutTemplateId],
    queryFn: async () => {
      if (!workout?.workoutTemplateId) return null;
      const data = await apiRequest('GET', `/api/workout-templates/${workout.workoutTemplateId}`);
      return data;
    },
    staleTime: 60000, // 1 minute
    enabled: !!workout?.workoutTemplateId,
  });
  
  // Fetch template exercises
  const { data: templateExercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['/api/workout-templates', workout?.workoutTemplateId, 'exercises'],
    queryFn: async () => {
      if (!workout?.workoutTemplateId) return null;
      const data = await apiRequest('GET', `/api/workout-templates/${workout.workoutTemplateId}/exercises`);
      return data;
    },
    staleTime: 60000, // 1 minute
    enabled: !!workout?.workoutTemplateId,
  });
  
  // Fetch exercise details
  const { data: exercises } = useQuery({
    queryKey: ['/api/exercises'],
    queryFn: async () => {
      const data = await apiRequest('GET', '/api/exercises');
      return data;
    },
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
  
  // Rest timer effect
  useEffect(() => {
    if (restTimerActive && restTimer !== null && restTimer > 0) {
      restTimerRef.current = setInterval(() => {
        setRestTimer((prev) => {
          if (prev !== null && prev > 0) {
            return prev - 1;
          } else {
            clearInterval(restTimerRef.current as NodeJS.Timeout);
            setRestTimerActive(false);
            return null;
          }
        });
      }, 1000);
    } else if (restTimer === 0) {
      toast({
        title: "Rest Complete",
        description: "Time to start your next set!",
      });
      clearInterval(restTimerRef.current as NodeJS.Timeout);
      setRestTimerActive(false);
      setRestTimer(null);
    }
    
    return () => {
      if (restTimerRef.current) {
        clearInterval(restTimerRef.current);
      }
    };
  }, [restTimerActive, restTimer, toast]);
  
  // Create workout set mutation
  const createSetMutation = useMutation({
    mutationFn: async (data: any) => {
      // Make sure setType is used instead of type for the API
      const payload = {
        completedWorkoutId: workoutId,
        exerciseId: data.exerciseId,
        weight: data.weight,
        reps: data.reps,
        rpe: data.rpe || 7,
        setNumber: data.setNumber,
        setType: data.setType || 'working',
        isCompleted: true,
        timestamp: new Date().toISOString()
      };
      
      console.log("Sending workout set data:", payload);
      return await apiRequest('POST', '/api/workout-sets', payload);
    },
    onSuccess: (data) => {
      console.log("Set created successfully:", data);
      queryClient.invalidateQueries({ queryKey: [`/api/completed-workouts/${workoutId}/sets`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save workout set",
        variant: "destructive"
      });
      console.error("Error creating set:", error);
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
  const updateSetValue = (exerciseId: number, setIndex: number, field: string, value: number | string | boolean) => {
    const currentSets = exerciseSets.get(exerciseId) || [];
    const updatedSets = [...currentSets];
    updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: value };
    
    const newSetsMap = new Map(exerciseSets);
    newSetsMap.set(exerciseId, updatedSets);
    setExerciseSets(newSetsMap);
  };
  
  // Add a new set
  const addSet = (exerciseId: number) => {
    const currentSets = exerciseSets.get(exerciseId) || [];
    const newSetNumber = currentSets.length + 1;
    
    const newSet = {
      setNumber: newSetNumber,
      weight: currentSets.length > 0 ? currentSets[currentSets.length - 1].weight : 0,
      reps: currentSets.length > 0 ? currentSets[currentSets.length - 1].reps : 0,
      type: 'working',
      isCompleted: false
    };
    
    const updatedSets = [...currentSets, newSet];
    const newSetsMap = new Map(exerciseSets);
    newSetsMap.set(exerciseId, updatedSets);
    setExerciseSets(newSetsMap);
    
    toast({
      title: "Set Added",
      description: `Set ${newSetNumber} added to exercise`,
    });
  };
  
  // Remove the last set
  const removeSet = (exerciseId: number) => {
    const currentSets = exerciseSets.get(exerciseId) || [];
    
    if (currentSets.length <= 1) {
      toast({
        title: "Cannot Remove",
        description: "You need at least one set for the exercise",
        variant: "destructive"
      });
      return;
    }
    
    // Check if the last set is completed
    if (currentSets[currentSets.length - 1].isCompleted) {
      toast({
        title: "Cannot Remove",
        description: "Cannot remove a completed set",
        variant: "destructive"
      });
      return;
    }
    
    const updatedSets = currentSets.slice(0, -1);
    const newSetsMap = new Map(exerciseSets);
    newSetsMap.set(exerciseId, updatedSets);
    setExerciseSets(newSetsMap);
    
    toast({
      title: "Set Removed",
      description: `Set ${currentSets.length} removed from exercise`,
    });
  };
  
  // Start rest timer
  const startRestTimer = (seconds: number) => {
    if (restTimerActive) {
      clearInterval(restTimerRef.current as NodeJS.Timeout);
    }
    
    setRestTimer(seconds);
    setRestTimerActive(true);
    
    toast({
      title: "Rest Timer Started",
      description: `${seconds} seconds rest timer started`,
    });
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
    
    try {
      // Use setType field instead of type for the API
      createSetMutation.mutate({
        completedWorkoutId: workoutId,
        exerciseId,
        weight: parseFloat(set.weight),
        reps: parseInt(set.reps),
        rpe: 7, // Default RPE
        setNumber: set.setNumber,
        setType: set.type || 'working', // Ensure we're using the correct field name
        isCompleted: true,
        timestamp: new Date().toISOString()
      });
      
      // Mark as completed locally
      updateSetValue(exerciseId, setIndex, 'isCompleted', true);
      
      toast({
        title: "Set Saved",
        description: `${set.weight}kg x ${set.reps} reps`,
      });
      
      // Start a rest timer if not the last set
      if (setIndex < currentSets.length - 1) {
        // Get rest time from the template exercise
        const restSeconds = currentTemplateExercise.restSeconds || 90;
        startRestTimer(restSeconds);
      }
    } catch (error) {
      console.error("Error saving set:", error);
      toast({
        title: "Error",
        description: "Failed to save set data. Please try again.",
        variant: "destructive"
      });
    }
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
        
        {/* Rest Timer */}
        {restTimerActive && restTimer !== null && (
          <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100 flex items-center justify-between">
            <div className="flex items-center">
              <TimerIcon className="text-blue-600 mr-2" size={20} />
              <div>
                <div className="text-sm font-medium">Rest Timer</div>
                <div className="text-lg font-bold text-blue-600">{restTimer}s</div>
              </div>
            </div>
            <button 
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
              onClick={() => {
                clearInterval(restTimerRef.current as NodeJS.Timeout);
                setRestTimerActive(false);
                setRestTimer(null);
              }}
            >
              Skip
            </button>
          </div>
        )}
        
        {/* Exercise List Toggle */}
        <button 
          className="flex items-center justify-between w-full mt-3 text-sm font-medium text-gray-600 bg-gray-50 p-2 rounded-lg"
          onClick={() => setShowAllExercises(!showAllExercises)}
        >
          <span>All Exercises</span>
          {showAllExercises ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        
        {/* Exercise List */}
        {showAllExercises && (
          <div className="mt-2 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-2">
            {templateExercises.map((exercise, index) => {
              const ex = exercises?.find((e: any) => e.id === exercise.exerciseId);
              const sets = exerciseSets.get(exercise.exerciseId) || [];
              const completedSets = sets.filter(s => s.isCompleted).length;
              
              return (
                <div 
                  key={exercise.id} 
                  className={`p-2 rounded-lg mb-1 border ${
                    index === currentExerciseIndex 
                      ? 'bg-primary-50 border-primary-100' 
                      : 'bg-white border-gray-100'
                  } ${
                    completedSets === sets.length && sets.length > 0
                      ? 'border-green-200 bg-green-50'
                      : ''
                  }`}
                  onClick={() => {
                    setCurrentExerciseIndex(index);
                    setShowAllExercises(false);
                  }}
                >
                  <div className="flex justify-between">
                    <div className="font-medium text-sm">{ex?.name || 'Exercise'}</div>
                    <div className="text-xs text-gray-500">{completedSets}/{sets.length} sets</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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