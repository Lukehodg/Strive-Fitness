import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, parseISO } from 'date-fns';

// Define our workout template interface
interface WorkoutTemplate {
  id: number;
  userId: number;
  name: string;
  description?: string;
  scheduledDay?: string;
  exerciseCount: number;
  duration: number;
  color: string;
}

export default function WeeklyPlanPage() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [date, setDate] = useState<Date>(new Date());
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  
  // Get all workout templates
  const { data: workoutTemplates, isLoading } = useQuery<WorkoutTemplate[]>({
    queryKey: ['/api/users/1/workout-templates'],
    queryFn: async () => {
      const response = await fetch('/api/users/1/workout-templates');
      if (!response.ok) {
        throw new Error('Failed to fetch workout templates');
      }
      return response.json();
    }
  });
  
  // When date changes, calculate the days in the week
  useEffect(() => {
    const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday as first day
    const end = endOfWeek(date, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    setWeekDays(days);
  }, [date]);

  // Convert day name to date object in current week
  const dayNameToDate = (dayName: string): Date | undefined => {
    if (!dayName) return undefined;
    
    const dayMap: { [key: string]: number } = {
      'Monday': 0,
      'Tuesday': 1,
      'Wednesday': 2,
      'Thursday': 3,
      'Friday': 4,
      'Saturday': 5,
      'Sunday': 6
    };
    
    const dayIndex = dayMap[dayName];
    return weekDays[dayIndex];
  };
  
  // Get workouts for a specific day
  const getWorkoutsForDay = (dayName: string): WorkoutTemplate[] => {
    if (!workoutTemplates) return [];
    return workoutTemplates.filter(workout => workout.scheduledDay === dayName);
  };
  
  // Handle starting a workout
  const handleStartWorkout = (workoutId: number) => {
    navigate(`/workouts/${workoutId}`);
  };

  return (
    <div className="container mx-auto py-6 max-w-5xl">
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="mr-2" 
          onClick={() => navigate('/')}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-2xl font-bold text-white">Weekly Workout Plan</h1>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4 mb-8">
        {weekDays.map((day, index) => {
          const dayName = format(day, 'EEEE');
          const workouts = getWorkoutsForDay(dayName);
          const isToday = format(new Date(), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
          
          return (
            <Card key={index} className={`bg-gray-800 border-gray-700 ${isToday ? 'ring-2 ring-primary' : ''}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-center text-lg">
                  {format(day, 'EEE')}
                  <span className="block text-sm font-normal text-gray-400">{format(day, 'MMM d')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {workouts.length > 0 ? (
                  <div className="space-y-2">
                    {workouts.map(workout => (
                      <div 
                        key={workout.id}
                        className="p-3 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700"
                        style={{ backgroundColor: `${workout.color}20` }}
                        onClick={() => handleStartWorkout(workout.id)}
                      >
                        <p className="font-medium text-white">{workout.name}</p>
                        <p className="text-xs text-gray-400">{workout.exerciseCount} exercises · {workout.duration} min</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <p className="text-xs">No workouts</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      <div className="flex justify-center">
        <Card className="bg-gray-800 border-gray-700 w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-center">Select Week</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(date) => date && setDate(date)}
              className="rounded-md border border-gray-700"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}