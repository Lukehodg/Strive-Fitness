import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, startOfWeek } from 'date-fns';

import GreetingSection from '@/components/dashboard/greeting-section';
import ProgressSection from '@/components/dashboard/progress-section';
import TodayActivities from '@/components/dashboard/today-activities';
import WeeklyWorkoutPlan from '@/components/dashboard/weekly-workout-plan';

// Define interfaces for typings
interface User {
  displayName: string;
  dailyCalorieTarget: number;
  dailyStepTarget: number;
  [key: string]: any;
}

interface DailyStats {
  caloriesConsumed: number;
  stepsCount: number;
  waterIntake: number;
  [key: string]: any;
}

interface DashboardActivity {
  id: number;
  userId: number;
  type: string;
  title: string;
  description: string;
  [key: string]: any;
}

const Dashboard = () => {
  const [_, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  
  // Fetch user data
  const { data: userData } = useQuery<User>({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch activities
  const { data: activities } = useQuery<DashboardActivity[]>({
    queryKey: ['/api/users/1/activities'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch daily stats
  const { data: dailyStats } = useQuery<DailyStats>({
    queryKey: ['/api/users/1/daily-stats'],
    staleTime: 60000, // 1 minute
  });
  
  // Create weekly workout plan
  const generateWeeklyPlan = () => {
    const today = new Date();
    const startOfWeekDate = startOfWeek(today, { weekStartsOn: 1 }); // Start from Monday
    
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const workouts = ['Upper', 'Lower', 'Rest', 'Push', 'Pull', 'Legs', 'Rest'];
    
    return weekdays.map((day, index) => {
      const date = addDays(startOfWeekDate, index);
      const isToday = format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
      
      return {
        date,
        day,
        workout: workouts[index],
        isToday
      };
    });
  };
  
  const handleViewAllActivities = () => {
    setLocation('/workouts');
  };
  
  const handleViewAllWorkouts = () => {
    setLocation('/workouts');
  };
  
  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);
  
  if (!user || !dailyStats || !activities) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh] bg-gray-900 text-white">
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6 bg-gray-900 min-h-screen">
      <GreetingSection username={user.displayName.split(' ')[0]} />
      
      <ProgressSection 
        caloriesConsumed={dailyStats.caloriesConsumed}
        caloriesTarget={user.dailyCalorieTarget}
        stepsCount={dailyStats.stepsCount}
        stepsTarget={user.dailyStepTarget}
        waterIntake={dailyStats.waterIntake}
        waterTarget={3}
      />
      
      <TodayActivities 
        activities={activities}
        onViewAll={handleViewAllActivities}
      />
      
      <WeeklyWorkoutPlan 
        workoutPlan={generateWeeklyPlan()}
        onViewAll={handleViewAllWorkouts}
      />
    </div>
  );
};

export default Dashboard;
