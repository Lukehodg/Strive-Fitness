import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, startOfWeek } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { apiRequest } from '@/lib/queryClient';

import GreetingSection from '@/components/dashboard/greeting-section';
import TodayActivities from '@/components/dashboard/today-activities';
import WeeklyWorkoutPlan from '@/components/dashboard/weekly-workout-plan';
import WidgetSystem, { Widget } from '@/components/dashboard/widget-system';
import AddWidgetDialog from '@/components/dashboard/add-widget-dialog';

// Define interfaces for typings
interface User {
  displayName: string;
  dailyCalorieTarget: number;
  dailyStepTarget: number;
  dashboardWidgets?: Widget[];
  [key: string]: any;
}

interface DailyStats {
  caloriesConsumed: number;
  stepsCount: number;
  waterIntake: number;
  proteinConsumed: number;
  carbsConsumed: number;
  fatConsumed: number;
  [key: string]: any;
}

interface DashboardActivity {
  id: number;
  userId: number;
  type: "workout" | "nutrition" | "medication";
  title: string;
  description: string;
  date?: string;
  [key: string]: any;
}

interface WorkoutTemplate {
  id: number;
  name: string;
  exerciseCount: number;
  duration: number;
  color: string;
}

const Dashboard = () => {
  const [_, setLocation] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [isAddWidgetDialogOpen, setIsAddWidgetDialogOpen] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const queryClient = useQueryClient();
  
  // Fetch user data
  const { data: userData } = useQuery<User>({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch activities for the selected date
  const { data: activities } = useQuery<DashboardActivity[]>({
    queryKey: ['/api/users/1/activities', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(`/api/users/1/activities?date=${format(selectedDate, 'yyyy-MM-dd')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }
      return response.json();
    },
    staleTime: 60000, // 1 minute
  });
  
  // Fetch daily stats for the selected date
  const { data: dailyStats } = useQuery<DailyStats>({
    queryKey: ['/api/users/1/daily-stats', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(`/api/users/1/daily-stats?date=${format(selectedDate, 'yyyy-MM-dd')}`);
      // If data not found for selected date, provide default empty stats
      if (response.status === 404) {
        return {
          id: 0,
          userId: 1,
          date: format(selectedDate, 'yyyy-MM-dd'),
          caloriesConsumed: 0,
          stepsCount: 0,
          waterIntake: 0,
          proteinConsumed: 0,
          carbsConsumed: 0,
          fatConsumed: 0
        };
      }
      if (!response.ok) {
        throw new Error('Failed to fetch daily stats');
      }
      return response.json();
    },
    staleTime: 60000, // 1 minute
  });
  
  // Fetch workout templates
  const { data: workoutTemplates } = useQuery<WorkoutTemplate[]>({
    queryKey: ['/api/users/1/workout-templates'],
    staleTime: 60000, // 1 minute
  });
  
  // Fetch user widgets
  const { data: userWidgets } = useQuery<Widget[]>({
    queryKey: ['/api/users/1/widgets'],
    staleTime: 60000, // 1 minute
  });
  
  // Mutation to update widgets
  const updateWidgetsMutation = useMutation({
    mutationFn: async (newWidgets: Widget[]) => {
      return await apiRequest('PUT', '/api/users/1/widgets', newWidgets);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/widgets'] });
    }
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
  
  // Create available widget data
  const generateAvailableWidgetData = () => {
    if (!user || !dailyStats) return {
      progress: [],
      nutrition: [],
      workouts: [],
      activities: []
    };
    
    const progressData = [
      {
        label: "Analytics",
        percentage: 100,
        color: "#8884d8",
        value: "View",
        total: "Progress",
        icon: "analytics",
        route: "/analytics" // Link to analytics page
      },
      {
        label: "Calories",
        percentage: Math.min(Math.round((dailyStats.caloriesConsumed / user.dailyCalorieTarget) * 100), 100),
        color: "#FF5722",
        value: String(dailyStats.caloriesConsumed),
        total: String(user.dailyCalorieTarget),
        route: "/nutrition" // Link to nutrition page
      },
      {
        label: "Steps",
        percentage: Math.min(Math.round((dailyStats.stepsCount / user.dailyStepTarget) * 100), 100),
        color: "#3F51B5",
        value: String(dailyStats.stepsCount),
        total: String(user.dailyStepTarget),
        route: "/steps" // Link to dedicated steps page
      },
      {
        label: "Water",
        percentage: Math.min(Math.round((dailyStats.waterIntake / 3) * 100), 100),
        color: "#03A9F4",
        value: String(dailyStats.waterIntake),
        total: "3L",
        route: "/water" // Link to our new water tracking page
      },
      {
        label: "Protein",
        percentage: Math.min(Math.round((dailyStats.proteinConsumed / user.dailyProteinTarget) * 100), 100),
        color: "#4CAF50",
        value: String(dailyStats.proteinConsumed),
        total: String(user.dailyProteinTarget) + "g",
        route: "/nutrition" // Link to nutrition page
      }
    ];
    
    const nutritionData = [
      {
        remaining: user.dailyCalorieTarget - dailyStats.caloriesConsumed,
        consumed: dailyStats.caloriesConsumed,
        target: user.dailyCalorieTarget,
        route: "/nutrition" // Link to nutrition page
      }
    ];
    
    // Add route to workout templates
    const workoutsData = workoutTemplates?.map(workout => ({
      ...workout,
      route: "/workouts"
    })) || [];
    
    // Add routes to activities based on their type
    const activitiesData = displayActivities.map(activity => ({
      ...activity,
      route: activity.type === "workout" ? "/workouts" : 
             activity.type === "nutrition" ? "/nutrition" : 
             activity.type === "medication" ? "/health" : undefined
    }));
    
    return {
      progress: progressData,
      nutrition: nutritionData,
      workouts: workoutsData,
      activities: activitiesData
    };
  };
  
  const handleViewAllActivities = () => {
    // Default to activities or workouts page
    setLocation('/workouts');
  };
  
  const handleViewAllWorkouts = () => {
    setLocation('/workouts');
  };
  
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    // In a real app, we would fetch data for the selected date
    // For now, we'll just update the state
  };
  
  const handleAddWidget = (widgetData: Omit<Widget, 'id'>) => {
    const newWidget: Widget = {
      ...widgetData,
      id: uuidv4()
    };
    
    const updatedWidgets = [...widgets, newWidget];
    setWidgets(updatedWidgets);
    updateWidgetsMutation.mutate(updatedWidgets);
  };
  
  const handleRemoveWidget = (id: string) => {
    const updatedWidgets = widgets.filter(widget => widget.id !== id);
    setWidgets(updatedWidgets);
    updateWidgetsMutation.mutate(updatedWidgets);
  };
  
  // Initialize user and widgets when data is loaded
  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);
  
  // Initialize widgets when user widgets are loaded
  useEffect(() => {
    if (userWidgets) {
      setWidgets(userWidgets);
    } else if (userData?.dashboardWidgets) {
      // Fall back to user's dashboard widgets if API call fails
      setWidgets(userData.dashboardWidgets as Widget[]);
    }
  }, [userWidgets, userData]);
  
  // Default to empty array if activities is undefined
  const displayActivities: DashboardActivity[] = activities || [];
  
  if (!user || !dailyStats) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh] bg-gray-900 text-white">
        <p>Loading...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6 bg-gray-900 min-h-screen">
      <GreetingSection username={user.displayName.split(' ')[0]} />
      
      {/* Widget System */}
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Dashboard</h2>
          <button
            onClick={() => setIsAddWidgetDialogOpen(true)}
            className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 text-white py-1 px-3 rounded-md text-sm transition-colors"
          >
            <span className="text-lg">+</span> Add Widget
          </button>
        </div>
        <WidgetSystem 
          widgets={widgets}
          onRemoveWidget={handleRemoveWidget}
          onReorderWidgets={(reorderedWidgets) => {
            setWidgets(reorderedWidgets);
            updateWidgetsMutation.mutate(reorderedWidgets);
          }}
        />
      </div>
      
      <TodayActivities 
        activities={displayActivities}
        onViewAll={handleViewAllActivities}
        selectedDate={selectedDate}
      />
      
      <WeeklyWorkoutPlan 
        workoutPlan={generateWeeklyPlan()}
        onViewAll={handleViewAllWorkouts}
        onDateSelect={handleDateSelect}
        selectedDate={selectedDate}
      />
      
      {/* Add Widget Dialog */}
      <AddWidgetDialog
        open={isAddWidgetDialogOpen}
        onOpenChange={setIsAddWidgetDialogOpen}
        onAddWidget={handleAddWidget}
        availableData={generateAvailableWidgetData()}
      />
    </div>
  );
};

export default Dashboard;
