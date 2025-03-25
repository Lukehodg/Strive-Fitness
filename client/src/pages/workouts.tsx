import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AddIcon } from '@/lib/icons';
import { useToast } from '@/hooks/use-toast';

import WorkoutStats from '@/components/workouts/workout-stats';
import WorkoutTemplates from '@/components/workouts/workout-templates';
import CurrentWorkout from '@/components/workouts/current-workout';

const Workouts = () => {
  const { toast } = useToast();
  
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
    queryKey: ['/api/workout-templates/1/exercises'],
    staleTime: 60000, // 1 minute
    enabled: !!currentWorkout,
  });
  
  // Fetch workout sets for current workout
  const { data: workoutSets } = useQuery({
    queryKey: ['/api/completed-workouts/1/sets'],
    staleTime: 60000, // 1 minute
    enabled: !!currentWorkout,
  });
  
  // Fetch exercises data
  const { data: exercises } = useQuery({
    queryKey: ['/api/exercises'],
    staleTime: 60000, // 1 minute
  });
  
  const handleCreateWorkout = () => {
    toast({
      title: "Create Workout",
      description: "This feature is coming soon!",
    });
  };
  
  const handleEditTemplates = () => {
    toast({
      title: "Edit Templates",
      description: "This feature is coming soon!",
    });
  };
  
  const handleContinueWorkout = () => {
    toast({
      title: "Continue Workout",
      description: "This feature is coming soon!",
    });
  };
  
  // Prepare data for CurrentWorkout component
  const prepareCurrentWorkoutData = () => {
    if (!exercises || !templateExercises || !workoutSets) return [];
    
    return templateExercises.map(te => {
      const exercise = exercises.find(ex => ex.id === te.exerciseId);
      const sets = workoutSets.filter(set => set.exerciseId === te.exerciseId);
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
  
  if (!workoutTemplates || !completedWorkouts) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading...</p>
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
