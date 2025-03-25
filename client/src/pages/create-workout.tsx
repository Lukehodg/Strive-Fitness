import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { ChevronRightIcon, AddIcon, CheckIcon } from '@/lib/icons';

const CreateWorkout = () => {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const [workoutName, setWorkoutName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<any[]>([]);
  
  // Fetch available exercises
  const { data: exercises, isLoading: isLoadingExercises } = useQuery({
    queryKey: ['/api/exercises'],
    queryFn: async () => {
      const data = await apiRequest('GET', '/api/exercises');
      return data || [];
    },
    staleTime: 60000, // 1 minute
  });
  
  // Mutation for creating a workout template
  const createWorkoutMutation = useMutation({
    mutationFn: async (data: any) => {
      const template = await apiRequest('POST', '/api/workout-templates', {
        userId: 1, // In a real app, we would get this from auth
        name: data.name,
        exerciseCount: data.exercises.length,
        duration: 45, // Default duration estimation
        color: getRandomColor()
      });
      
      // Create template exercises for each selected exercise
      const exercisePromises = data.exercises.map((exercise: any, index: number) => {
        return apiRequest('POST', '/api/workout-template-exercises', {
          workoutTemplateId: template.id,
          exerciseId: exercise.id,
          sets: exercise.sets,
          repsMin: exercise.repsMin,
          repsMax: exercise.repsMax,
          restSeconds: 90, // Default rest time
          order: index + 1
        });
      });
      
      await Promise.all(exercisePromises);
      return template;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Workout template created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/workout-templates'] });
      setLocation('/workouts');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create workout template",
        variant: "destructive"
      });
      console.error(error);
    }
  });
  
  // Random color generator for workout template
  const getRandomColor = () => {
    const colors = ['#3F51B5', '#009688', '#9C27B0', '#F44336', '#4CAF50'];
    return colors[Math.floor(Math.random() * colors.length)];
  };
  
  // Add exercise to the workout
  const handleAddExercise = (exercise: any) => {
    if (selectedExercises.some(e => e.id === exercise.id)) {
      toast({
        title: "Exercise already added",
        description: "This exercise is already in your workout",
      });
      return;
    }
    
    const exerciseWithSets = {
      ...exercise,
      sets: 3, // Default number of sets
      repsMin: 8, // Default min reps
      repsMax: 12, // Default max reps
      expanded: false // For UI expansion
    };
    
    setSelectedExercises([...selectedExercises, exerciseWithSets]);
  };
  
  // Remove exercise from the workout
  const handleRemoveExercise = (exerciseId: number) => {
    setSelectedExercises(selectedExercises.filter(e => e.id !== exerciseId));
  };
  
  // Toggle exercise expansion in UI
  const toggleExerciseExpansion = (exerciseId: number) => {
    setSelectedExercises(selectedExercises.map(e => {
      if (e.id === exerciseId) {
        return { ...e, expanded: !e.expanded };
      }
      return e;
    }));
  };
  
  // Update exercise sets/reps configuration
  const updateExerciseConfig = (exerciseId: number, field: string, value: number) => {
    setSelectedExercises(selectedExercises.map(e => {
      if (e.id === exerciseId) {
        return { ...e, [field]: value };
      }
      return e;
    }));
  };
  
  // Handle workout creation submission
  const handleCreateWorkout = () => {
    if (!workoutName.trim()) {
      toast({
        title: "Workout name required",
        description: "Please enter a name for your workout",
        variant: "destructive"
      });
      return;
    }
    
    if (selectedExercises.length === 0) {
      toast({
        title: "No exercises selected",
        description: "Please add at least one exercise to your workout",
        variant: "destructive"
      });
      return;
    }
    
    createWorkoutMutation.mutate({
      name: workoutName,
      exercises: selectedExercises
    });
  };
  
  // Handle cancel
  const handleCancel = () => {
    setLocation('/workouts');
  };
  
  if (isLoadingExercises) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading exercises...</p>
      </div>
    );
  }
  
  const muscleGroups = Array.from(
    new Set(exercises?.map((e: any) => e.muscleGroup))
  ).sort();
  
  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-['Inter',sans-serif] text-2xl font-bold">Create Workout</h2>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <label className="text-gray-500 text-sm block mb-1">Workout Name</label>
        <input 
          type="text" 
          value={workoutName} 
          onChange={(e) => setWorkoutName(e.target.value)}
          placeholder="My Workout Plan"
          className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-3 w-full text-lg" 
        />
      </div>
      
      {selectedExercises.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-4">Selected Exercises</h3>
          <div className="space-y-4">
            {selectedExercises.map((exercise, index) => (
              <div key={exercise.id} className="bg-[#F5F5F5] rounded-lg p-3">
                <div 
                  className="flex justify-between items-center cursor-pointer"
                  onClick={() => toggleExerciseExpansion(exercise.id)}
                >
                  <div className="flex items-center">
                    <div className="w-6 h-6 bg-primary text-white flex items-center justify-center rounded-full mr-3">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-medium">{exercise.name}</h4>
                      <p className="text-xs text-gray-500">{exercise.muscleGroup}</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <span className="text-sm text-gray-500 mr-2">
                      {exercise.sets} sets · {exercise.repsMin}-{exercise.repsMax} reps
                    </span>
                    <button 
                      className="text-red-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveExercise(exercise.id);
                      }}
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </div>
                </div>
                
                {exercise.expanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Sets</label>
                        <select 
                          value={exercise.sets}
                          onChange={(e) => updateExerciseConfig(exercise.id, 'sets', parseInt(e.target.value))}
                          className="bg-white border border-[#E0E0E0] rounded-lg p-2 w-full"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Min Reps</label>
                        <select 
                          value={exercise.repsMin}
                          onChange={(e) => updateExerciseConfig(exercise.id, 'repsMin', parseInt(e.target.value))}
                          className="bg-white border border-[#E0E0E0] rounded-lg p-2 w-full"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Max Reps</label>
                        <select 
                          value={exercise.repsMax}
                          onChange={(e) => updateExerciseConfig(exercise.id, 'repsMax', parseInt(e.target.value))}
                          className="bg-white border border-[#E0E0E0] rounded-lg p-2 w-full"
                        >
                          {[6, 8, 10, 12, 15, 20, 25, 30].map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold mb-4">Add Exercises</h3>
        
        {muscleGroups.map(group => (
          <div key={group} className="mb-4">
            <h4 className="font-medium text-gray-500 mb-2">{group}</h4>
            <div className="space-y-2">
              {exercises
                .filter((e: any) => e.muscleGroup === group)
                .map((exercise: any) => (
                  <div 
                    key={exercise.id} 
                    className="flex justify-between items-center bg-[#F5F5F5] rounded-lg p-3 hover:bg-[#EEEEEE] cursor-pointer"
                    onClick={() => handleAddExercise(exercise)}
                  >
                    <div>
                      <h5 className="font-medium">{exercise.name}</h5>
                      <p className="text-xs text-gray-500">{exercise.category}</p>
                    </div>
                    <button className="bg-primary/10 rounded-full p-1">
                      <AddIcon className="text-primary w-4 h-4" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex space-x-3 mt-8">
        <button 
          className="flex-1 bg-primary text-white py-3 rounded-lg font-medium flex items-center justify-center"
          onClick={handleCreateWorkout}
          disabled={createWorkoutMutation.isPending}
        >
          {createWorkoutMutation.isPending ? (
            <span>Creating...</span>
          ) : (
            <>
              <CheckIcon className="mr-2 w-5 h-5" />
              Create Workout
            </>
          )}
        </button>
        <button 
          className="flex-1 bg-[#F5F5F5] border border-[#E0E0E0] py-3 rounded-lg font-medium"
          onClick={handleCancel}
          disabled={createWorkoutMutation.isPending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default CreateWorkout;