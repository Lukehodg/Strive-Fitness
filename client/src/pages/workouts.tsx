import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { AddIcon } from '@/lib/icons';
import { useToast } from '@/hooks/use-toast';

import WorkoutStats from '@/components/workouts/workout-stats';
import WorkoutTemplates from '@/components/workouts/workout-templates';
import CurrentWorkout from '@/components/workouts/current-workout';

const Workouts = () => {
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  
  // Fetch workout templates
  const { data: workoutTemplates } = useQuery({
    queryKey: ['/api/users/1/workout-templates'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch completed workouts
  const { data: completedWorkouts } = useQuery({
    queryKey: ['/api/users/1/completed-workouts'],
    staleTime: 60000, // 1 minute
  });
  
  // Find current workout (last incomplete workout)
  const currentWorkout = completedWorkouts && completedWorkouts.length > 0
    ? completedWorkouts.find(workout => !workout.isCompleted)
    : null;
  
  // Fetch template exercises for current workout
  const { data: templateExercises } = useQuery({
    queryKey: ['/api/workout-templates', currentWorkout?.workoutTemplateId, 'exercises'],
    queryFn: async () => {
      if (!currentWorkout?.workoutTemplateId) return [];
      return await apiRequest('GET', `/api/workout-templates/${currentWorkout.workoutTemplateId}/exercises`);
    },
    staleTime: 60000, // 1 minute
    enabled: !!currentWorkout?.workoutTemplateId,
  });
  
  // Fetch workout sets for current workout
  const { data: workoutSets } = useQuery({
    queryKey: ['/api/completed-workouts', currentWorkout?.id, 'sets'],
    queryFn: async () => {
      if (!currentWorkout?.id) return [];
      return await apiRequest('GET', `/api/completed-workouts/${currentWorkout.id}/sets`);
    },
    staleTime: 60000, // 1 minute
    enabled: !!currentWorkout?.id,
  });
  
  // Fetch exercises data
  const { data: exercises } = useQuery({
    queryKey: ['/api/exercises'],
    staleTime: 60000, // 1 minute
  });
  
  const handleCreateWorkout = () => {
    setLocation('/workouts/create');
  };
  
  const handleEditTemplates = () => {
    toast({
      title: "Edit Templates",
      description: "This feature will be available soon!",
    });
  };
  
  const handleContinueWorkout = () => {
    if (currentWorkout) {
      setLocation(`/workouts/active/${currentWorkout.id}`);
    } else {
      // If no current workout, create one from the first template
      startWorkoutMutation.mutate(workoutTemplates[0]?.id || 1);
    }
  };
  
  // Mutation for starting a new workout
  const startWorkoutMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const startedWorkout = await apiRequest('POST', '/api/completed-workouts', {
        userId: 1, // In a real app, we would get this from auth
        workoutTemplateId: templateId,
        startTime: new Date().toISOString()
      });
      return startedWorkout;
    },
    onSuccess: (data) => {
      toast({
        title: "Workout Started",
        description: "Your workout has been started",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/completed-workouts'] });
      // Navigate to the active workout page
      setLocation(`/workouts/active/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to start workout",
        variant: "destructive"
      });
      console.error(error);
    }
  });
  
  // Prepare data for CurrentWorkout component
  const prepareCurrentWorkoutData = () => {
    if (!exercises || !templateExercises || !workoutSets) return [];
    
    // Ensure templateExercises is an array before calling map
    const exercisesArray = Array.isArray(templateExercises) ? templateExercises : [];
    
    return exercisesArray.map(te => {
      // Check if exercises is an array
      const exercisesArray = Array.isArray(exercises) ? exercises : [];
      const exercise = exercisesArray.find(ex => ex.id === te.exerciseId);
      
      // Check if workoutSets is an array
      const setsArray = Array.isArray(workoutSets) ? workoutSets : [];
      const sets = setsArray.filter(set => set.exerciseId === te.exerciseId);
      const isCompleted = sets.length >= te.sets;
      
      return {
        id: te.id,
        exerciseId: te.exerciseId,
        exerciseName: exercise ? exercise.name : `Exercise ${te.exerciseId}`,
        sets: te.sets,
        repsMin: te.repsMin,
        repsMax: te.repsMax,
        weight: sets.length > 0 ? sets[0].weight : 0,
        isCompleted
      };
    });
  };
  
  const isDataLoaded = 
    workoutTemplates && 
    Array.isArray(workoutTemplates) && 
    completedWorkouts && 
    Array.isArray(completedWorkouts);
    
  if (!isDataLoaded) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading workouts...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-['Inter',sans-serif] text-2xl font-bold">Workouts</h2>
        <button 
          className="bg-primary text-white rounded-full p-2"
          onClick={handleCreateWorkout}
        >
          <AddIcon className="w-6 h-6" />
        </button>
      </div>
      
      <WorkoutStats 
        weeklyWorkouts={4}
        weeklyWorkoutsChange={20}
        totalTime="5h 45m"
        totalTimeChange={15}
      />
      
      <WorkoutTemplates 
        templates={workoutTemplates}
        onEdit={handleEditTemplates}
      />
      
      {currentWorkout && exercises && templateExercises && workoutSets && (
        <CurrentWorkout 
          workoutName={workoutTemplates.find(t => t.id === currentWorkout.workoutTemplateId)?.name || 'Current Workout'}
          exercises={prepareCurrentWorkoutData()}
          onContinueWorkout={handleContinueWorkout}
        />
      )}
    </div>
  );
};

export default Workouts;
