import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeftIcon, BarChart4Icon, LineChartIcon, PieChartIcon, TrendingUpIcon } from 'lucide-react';
import { useLocation } from 'wouter';
import { 
  Line, 
  LineChart, 
  Bar, 
  BarChart,
  Pie, 
  PieChart, 
  Cell,
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis,
  Legend,
  CartesianGrid
} from 'recharts';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Helper functions to format dates for chart
function formatDate(date: Date): string {
  return format(date, 'MMM d');
}

function formatChartDate(date: Date | string): string {
  if (typeof date === 'string') {
    try {
      return format(parseISO(date), 'MM/dd');
    } catch {
      return date;
    }
  }
  return format(date, 'MM/dd');
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function AnalyticsPage() {
  const [_, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('week');
  
  // Fetch user data
  const { data: userData } = useQuery<any>({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });

  // Fetch daily stats
  const { data: dailyStats } = useQuery<any>({
    queryKey: ['/api/users/1/daily-stats'],
    staleTime: 60000, // 1 minute
  });

  // Fetch workout data
  const { data: completedWorkouts = [] } = useQuery<any[]>({
    queryKey: ['/api/users/1/completed-workouts'],
    staleTime: 60000, // 1 minute
  });

  // Fetch health metrics
  const { data: healthMetrics = [] } = useQuery<any[]>({
    queryKey: ['/api/users/1/health-metrics'],
    staleTime: 60000, // 1 minute
  });

  // Fetch meal data
  const { data: meals = [] } = useQuery<any[]>({
    queryKey: ['/api/users/1/meals'],
    staleTime: 60000, // 1 minute
  });

  // Generate date range based on selected timeframe
  const getDateRange = () => {
    const today = new Date();
    let startDate, endDate;
    
    switch (timeRange) {
      case 'week':
        startDate = startOfWeek(today);
        endDate = endOfWeek(today);
        break;
      case 'month':
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
        break;
      case 'year':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      default:
        startDate = subDays(today, 7);
        endDate = today;
    }
    
    return { startDate, endDate };
  };

  // Generate workout analytics data
  const generateWorkoutData = () => {
    const { startDate, endDate } = getDateRange();
    
    // Filter workouts within the date range
    const filteredWorkouts = completedWorkouts.filter(workout => {
      const workoutDate = new Date(workout.startTime);
      return workoutDate >= startDate && workoutDate <= endDate;
    });
    
    // Group workouts by date for line chart
    const workoutsByDate = filteredWorkouts.reduce((acc: any, workout) => {
      const dateStr = format(new Date(workout.startTime), 'yyyy-MM-dd');
      if (!acc[dateStr]) {
        acc[dateStr] = { date: dateStr, count: 0, duration: 0 };
      }
      acc[dateStr].count += 1;
      
      // Calculate duration if both start and end times exist
      if (workout.endTime) {
        const startTime = new Date(workout.startTime).getTime();
        const endTime = new Date(workout.endTime).getTime();
        const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));
        acc[dateStr].duration += durationMinutes;
      }
      
      return acc;
    }, {});
    
    // Convert to array and sort by date
    return Object.values(workoutsByDate).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  // Generate nutrition analytics data
  const generateNutritionData = () => {
    const { startDate, endDate } = getDateRange();
    
    // Filter meals within the date range
    const filteredMeals = meals.filter(meal => {
      const mealDate = new Date(meal.timestamp);
      return mealDate >= startDate && mealDate <= endDate;
    });
    
    // Group meals by date for line chart
    const mealsByDate = filteredMeals.reduce((acc: any, meal) => {
      const dateStr = format(new Date(meal.timestamp), 'yyyy-MM-dd');
      if (!acc[dateStr]) {
        acc[dateStr] = { 
          date: dateStr, 
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        };
      }
      acc[dateStr].calories += meal.calories || 0;
      acc[dateStr].protein += meal.protein || 0;
      acc[dateStr].carbs += meal.carbs || 0;
      acc[dateStr].fat += meal.fat || 0;
      
      return acc;
    }, {});
    
    // Convert to array and sort by date
    return Object.values(mealsByDate).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  // Generate macronutrient distribution data for pie chart
  const generateMacroDistribution = () => {
    // Sum all macros for the time period
    const nutrition = generateNutritionData();
    
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;
    
    nutrition.forEach((day: any) => {
      totalProtein += day.protein;
      totalCarbs += day.carbs;
      totalFat += day.fat;
    });
    
    // Convert to percentages
    const total = totalProtein + totalCarbs + totalFat;
    
    return [
      { name: 'Protein', value: totalProtein, percentage: Math.round((totalProtein / total) * 100) },
      { name: 'Carbs', value: totalCarbs, percentage: Math.round((totalCarbs / total) * 100) },
      { name: 'Fat', value: totalFat, percentage: Math.round((totalFat / total) * 100) }
    ];
  };

  // Generate health metrics data
  const generateHealthData = () => {
    const { startDate, endDate } = getDateRange();
    
    // Filter health metrics within the date range
    const filteredMetrics = healthMetrics.filter(metric => {
      const metricDate = new Date(metric.timestamp);
      return metricDate >= startDate && metricDate <= endDate;
    });
    
    // Group by date and metric type
    const metricsByDate: Record<string, any> = {};
    
    filteredMetrics.forEach(metric => {
      const dateStr = format(new Date(metric.timestamp), 'yyyy-MM-dd');
      if (!metricsByDate[dateStr]) {
        metricsByDate[dateStr] = { date: dateStr };
      }
      
      // Different handling based on metric type
      if (metric.metricType === 'weight') {
        metricsByDate[dateStr].weight = metric.value;
      } else if (metric.metricType === 'blood_pressure') {
        metricsByDate[dateStr].systolic = metric.systolic;
        metricsByDate[dateStr].diastolic = metric.diastolic;
      } else if (metric.metricType === 'heart_rate') {
        metricsByDate[dateStr].heartRate = metric.value;
      } else if (metric.metricType === 'blood_glucose') {
        metricsByDate[dateStr].bloodGlucose = metric.value;
      }
    });
    
    // Convert to array and sort by date
    return Object.values(metricsByDate).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  };

  // Generate fitness progress data
  const generateProgressData = () => {
    // Most recent stats on tracked exercises (e.g., personal bests)
    // For demo, we'll generate some sample progress data
    const exerciseProgress = [
      { name: 'Bench Press', current: 185, previous: 175, change: 10 },
      { name: 'Squat', current: 265, previous: 245, change: 20 },
      { name: 'Deadlift', current: 315, previous: 295, change: 20 },
      { name: 'Overhead Press', current: 135, previous: 125, change: 10 }
    ];
    
    return exerciseProgress;
  };

  // Generate summary stats
  const generateSummaryStats = () => {
    const workoutData = generateWorkoutData();
    const nutritionData = generateNutritionData();
    const healthData = generateHealthData();
    
    // Calculate avg workouts per week
    const totalWorkouts = workoutData.reduce((sum: number, day: any) => sum + day.count, 0);
    const avgWorkoutsPerWeek = timeRange === 'week' ? totalWorkouts : 
      timeRange === 'month' ? (totalWorkouts / 4).toFixed(1) : (totalWorkouts / 52).toFixed(1);
    
    // Calculate avg workout duration
    const totalDuration = workoutData.reduce((sum: number, day: any) => sum + day.duration, 0);
    const avgDuration = totalWorkouts > 0 ? Math.round(totalDuration / totalWorkouts) : 0;
    
    // Calculate avg daily calories
    const totalCalories = nutritionData.reduce((sum: number, day: any) => sum + day.calories, 0);
    const avgCalories = nutritionData.length > 0 ? Math.round(totalCalories / nutritionData.length) : 0;
    
    // Weight change if available
    let weightChange = 'N/A';
    const weightData = healthData.filter((day: any) => day.weight !== undefined);
    if (weightData.length >= 2) {
      const firstWeight = weightData[0].weight;
      const lastWeight = weightData[weightData.length - 1].weight;
      const change = Number((lastWeight - firstWeight).toFixed(1));
      weightChange = `${change > 0 ? '+' : ''}${change} lbs`;
    }
    
    return {
      avgWorkoutsPerWeek,
      avgDuration,
      avgCalories,
      weightChange
    };
  };

  // Handle time range changes
  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value);
  };

  // Calculate various datasets
  const workoutData = generateWorkoutData();
  const nutritionData = generateNutritionData();
  const macroDistribution = generateMacroDistribution();
  const healthData = generateHealthData();
  const progressData = generateProgressData();
  const summaryStats = generateSummaryStats();

  return (
    <div className="p-4 space-y-6 bg-gray-900 text-white min-h-screen">
      {/* Header with back button */}
      <div className="flex items-center gap-2 mb-4">
        <Button 
          variant="ghost" 
          size="sm"
          className="p-0 h-9 w-9"
          onClick={() => navigate("/")}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Button>
        <h1 className="text-2xl font-bold">Analytics & Progress</h1>
      </div>

      {/* Time range selector */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-400">
          View your fitness insights and progress reports
        </div>
        <Select value={timeRange} onValueChange={handleTimeRangeChange}>
          <SelectTrigger className="w-32 bg-gray-800 border-gray-700">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="year">Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="dark-card">
          <CardContent className="p-4 flex flex-col items-center">
            <div className="text-sm text-gray-400">Avg. Workouts/Week</div>
            <div className="text-2xl font-bold text-blue-400 mt-1">{summaryStats.avgWorkoutsPerWeek}</div>
          </CardContent>
        </Card>
        <Card className="dark-card">
          <CardContent className="p-4 flex flex-col items-center">
            <div className="text-sm text-gray-400">Avg. Duration</div>
            <div className="text-2xl font-bold text-indigo-400 mt-1">{summaryStats.avgDuration} min</div>
          </CardContent>
        </Card>
        <Card className="dark-card">
          <CardContent className="p-4 flex flex-col items-center">
            <div className="text-sm text-gray-400">Avg. Daily Calories</div>
            <div className="text-2xl font-bold text-orange-400 mt-1">{summaryStats.avgCalories}</div>
          </CardContent>
        </Card>
        <Card className="dark-card">
          <CardContent className="p-4 flex flex-col items-center">
            <div className="text-sm text-gray-400">Weight Change</div>
            <div className="text-2xl font-bold text-teal-400 mt-1">{summaryStats.weightChange}</div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full bg-gray-800">
          <TabsTrigger value="overview" className="data-[state=active]:bg-gray-700">
            <TrendingUpIcon className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="workouts" className="data-[state=active]:bg-gray-700">
            <BarChart4Icon className="h-4 w-4 mr-2" />
            Workouts
          </TabsTrigger>
          <TabsTrigger value="nutrition" className="data-[state=active]:bg-gray-700">
            <PieChartIcon className="h-4 w-4 mr-2" />
            Nutrition
          </TabsTrigger>
          <TabsTrigger value="health" className="data-[state=active]:bg-gray-700">
            <LineChartIcon className="h-4 w-4 mr-2" />
            Health
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Progress Highlights */}
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Fitness Progress Highlights</CardTitle>
              <CardDescription>Your most significant improvements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {progressData.map((exercise, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{exercise.name}</div>
                      <div className="text-sm text-gray-400">{exercise.current} lbs</div>
                    </div>
                    <div className="flex items-center">
                      <span className={`${exercise.change > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {exercise.change > 0 ? '+' : ''}{exercise.change} lbs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          
          {/* Mixed Chart */}
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Activity Overview</CardTitle>
              <CardDescription>Workout frequency and calorie intake</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[...workoutData].map((day: any, index) => {
                    // Find matching nutrition data for this day if available
                    const nutritionDay = nutritionData.find((n: any) => n.date === day.date);
                    return {
                      ...day,
                      calories: nutritionDay && nutritionDay.calories ? nutritionDay.calories : 0
                    };
                  })}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis 
                    yAxisId="left" 
                    stroke="#0088FE" 
                    label={{ value: 'Workouts', angle: -90, position: 'insideLeft', fill: '#0088FE' }} 
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="#FF8042" 
                    label={{ value: 'Calories', angle: 90, position: 'insideRight', fill: '#FF8042' }} 
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Line 
                    yAxisId="left"
                    type="monotone" 
                    dataKey="count" 
                    name="Workouts"
                    stroke="#0088FE" 
                    activeDot={{ r: 8 }} 
                  />
                  <Line 
                    yAxisId="right"
                    type="monotone" 
                    dataKey="calories" 
                    name="Calories"
                    stroke="#FF8042" 
                    activeDot={{ r: 8 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workouts Tab */}
        <TabsContent value="workouts" className="mt-4 space-y-4">
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Workout Frequency</CardTitle>
              <CardDescription>Number of workouts completed over time</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={workoutData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    formatter={(value) => [`${value} workouts`, 'Count']}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Bar dataKey="count" name="Workouts" fill="#0088FE" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Workout Duration</CardTitle>
              <CardDescription>Average time spent per workout</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={workoutData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis 
                    stroke="#6b7280"
                    label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    formatter={(value) => [`${value} minutes`, 'Duration']}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="duration" 
                    name="Duration" 
                    stroke="#00C49F" 
                    activeDot={{ r: 8 }} 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Nutrition Tab */}
        <TabsContent value="nutrition" className="mt-4 space-y-4">
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Calorie Intake</CardTitle>
              <CardDescription>Daily calorie consumption over time</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={nutritionData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis 
                    stroke="#6b7280"
                    label={{ value: 'Calories', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    formatter={(value) => [`${value} calories`, 'Calories']}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Bar dataKey="calories" name="Calories" fill="#FF8042" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Macronutrient Distribution</CardTitle>
              <CardDescription>Breakdown of your protein, carbs, and fat intake</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] flex items-center justify-center">
              <div className="flex flex-col items-center">
                <div className="h-[200px] w-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={macroDistribution}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percentage }) => `${name}: ${percentage}%`}
                      >
                        {macroDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value, name) => [`${value}g`, name]}
                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: 'white' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-4">
                  {macroDistribution.map((macro, index) => (
                    <div key={index} className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-1" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm">{macro.name}: {macro.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="mt-4 space-y-4">
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Weight Tracking</CardTitle>
              <CardDescription>Monitor your weight changes over time</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={healthData.filter((day: any) => day.weight !== undefined)}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis 
                    stroke="#6b7280"
                    label={{ value: 'Weight (lbs)', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    formatter={(value) => [`${value} lbs`, 'Weight']}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="weight" 
                    name="Weight" 
                    stroke="#8884d8" 
                    activeDot={{ r: 8 }} 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Heart Rate</CardTitle>
              <CardDescription>Track your heart rate measurements</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={healthData.filter((day: any) => day.heartRate !== undefined)}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis 
                    stroke="#6b7280"
                    label={{ value: 'BPM', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    formatter={(value) => [`${value} bpm`, 'Heart Rate']}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="heartRate" 
                    name="Heart Rate" 
                    stroke="#FF8042" 
                    activeDot={{ r: 8 }} 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          {/* Blood Pressure Chart */}
          <Card className="dark-card">
            <CardHeader>
              <CardTitle>Blood Pressure</CardTitle>
              <CardDescription>Monitor your systolic and diastolic readings</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={healthData.filter((day: any) => day.systolic !== undefined && day.diastolic !== undefined)}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={formatChartDate} 
                    stroke="#6b7280"
                  />
                  <YAxis 
                    stroke="#6b7280"
                    label={{ value: 'mmHg', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                    formatter={(value, name) => [`${value} mmHg`, name]}
                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151' }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="systolic" 
                    name="Systolic" 
                    stroke="#0088FE" 
                    activeDot={{ r: 8 }} 
                    strokeWidth={2}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="diastolic" 
                    name="Diastolic" 
                    stroke="#00C49F" 
                    activeDot={{ r: 8 }} 
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}