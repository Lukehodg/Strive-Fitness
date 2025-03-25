import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subMonths, subDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import ExerciseDetail from '@/components/exercise/exercise-detail';
import ProgressChart from '@/components/exercise/progress-chart';

interface ExerciseProps {
  exerciseId: number;
}

const Exercise: React.FC<ExerciseProps> = ({ exerciseId }) => {
  const { toast } = useToast();
  const [chartData, setChartData] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState<string>('month');
  
  // Fetch exercise data
  const { data: exercise } = useQuery({
    queryKey: [`/api/exercises/${exerciseId}`],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch exercise sets
  const { data: exerciseSets, refetch: refetchSets } = useQuery({
    queryKey: [`/api/exercises/${exerciseId}/sets`],
    staleTime: 60000, // 1 minute
  });
  
  // Handle adding a new set
  const handleAddSet = async (weight: number, reps: number, rpe: number) => {
    try {
      // In a real app, we would use the current workout ID
      const completedWorkoutId = 1;
      
      await apiRequest('POST', '/api/workout-sets', {
        completedWorkoutId,
        exerciseId,
        weight,
        reps,
        rpe,
        setNumber: exerciseSets ? exerciseSets.length + 1 : 1,
        isCompleted: true,
        timestamp: new Date().toISOString()
      });
      
      toast({
        title: "Set Added",
        description: `Added ${reps} reps at ${weight}kg`,
      });
      
      refetchSets();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add set",
        variant: "destructive"
      });
      console.error(error);
    }
  };
  
  // Prepare personal best data
  const preparePersonalBests = (sets: any[] | undefined) => {
    if (!sets || sets.length === 0) {
      return [
        { weight: 0, label: '1RM' },
        { weight: 0, label: '5RM' },
        { weight: 0, label: '10RM' }
      ];
    }
    
    // Calculate 1RM, 5RM, 10RM based on sets
    // This is a simple approximation (weight of highest weight set for each rep range)
    const oneRM = sets
      .filter(set => set.reps === 1)
      .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;
      
    const fiveRM = sets
      .filter(set => set.reps >= 3 && set.reps <= 6)
      .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;
      
    const tenRM = sets
      .filter(set => set.reps >= 8 && set.reps <= 12)
      .sort((a, b) => b.weight - a.weight)[0]?.weight || 0;
    
    return [
      { weight: oneRM || 80, label: '1RM' },
      { weight: fiveRM || 70, label: '5RM' },
      { weight: tenRM || 65, label: '10RM' }
    ];
  };
  
  // Prepare recent sets data
  const prepareRecentSets = (sets: any[] | undefined) => {
    if (!sets || sets.length === 0) return [];
    
    return sets.slice(0, 3).map((set, index) => ({
      id: set.id,
      setNumber: index + 1,
      reps: set.reps,
      weight: set.weight,
      date: format(new Date(set.timestamp), 'd MMM yyyy')
    }));
  };
  
  // Generate chart data based on time range
  useEffect(() => {
    if (!exerciseSets) return;
    
    const today = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'month':
        startDate = subMonths(today, 1);
        break;
      case '3months':
        startDate = subMonths(today, 3);
        break;
      case '6months':
        startDate = subMonths(today, 6);
        break;
      case 'year':
        startDate = subMonths(today, 12);
        break;
      default:
        startDate = subMonths(today, 1);
    }
    
    // For demo purposes, generate some fake progression data
    // In a real app, we would filter the actual sets by date
    const data = [];
    let currentDate = startDate;
    let weight = 50; // Starting weight
    
    while (currentDate <= today) {
      if (Math.random() > 0.7) { // Only add some dates, not every day
        // Slight random progression
        weight += Math.random() > 0.5 ? 2.5 : 0;
        
        data.push({
          date: format(currentDate, 'MM/dd'),
          weight
        });
      }
      currentDate = addDays(currentDate, 3 + Math.floor(Math.random() * 5));
    }
    
    setChartData(data);
  }, [exerciseSets, timeRange]);
  
  // Helper function to add days to a date
  function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  
  if (!exercise || !exerciseSets) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6">
      <ExerciseDetail 
        name={exercise.name}
        category={exercise.muscleGroup}
        personalBests={preparePersonalBests(exerciseSets)}
        recentSets={prepareRecentSets(exerciseSets)}
        onAddSet={handleAddSet}
      />
      
      <ProgressChart 
        data={chartData}
        onTimeRangeChange={setTimeRange}
      />
    </div>
  );
};

export default Exercise;
