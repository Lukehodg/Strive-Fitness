import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subDays, parseISO } from 'date-fns';
import { ChevronLeftIcon } from 'lucide-react';
import { useLocation } from 'wouter';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiRequest } from '../lib/queryClient';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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

export default function WaterPage() {
  const [_, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [timeRange, setTimeRange] = useState('week');
  const [activeButton, setActiveButton] = useState<string>('week');

  // Fetch user data to get water target
  const { data: user } = useQuery<any>({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });

  // Fetch daily stats to get current water intake
  const { data: dailyStats } = useQuery<any>({
    queryKey: ['/api/users/1/daily-stats'],
    staleTime: 60000, // 1 minute
  });

  // Fetch historical health metrics for water intake (mock data for now)
  const { data: healthMetrics = [] } = useQuery<any[]>({
    queryKey: ['/api/users/1/health-metrics'],
    staleTime: 60000, // 1 minute
  });

  // Create mutation for updating daily stats (water intake)
  const updateDailyStatsMutation = useMutation({
    mutationFn: async (newWaterIntake: number) => {
      return await apiRequest('PATCH', `/api/daily-stats/${dailyStats?.id}`, {
        waterIntake: newWaterIntake
      });
    },
    onSuccess: () => {
      // Invalidate daily stats to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/daily-stats'] });
    }
  });

  // Handle adding water
  const handleAddWater = (amount: number) => {
    if (dailyStats) {
      const newWaterIntake = Math.min(dailyStats.waterIntake + amount, 5); // Cap at 5L
      updateDailyStatsMutation.mutate(newWaterIntake);
    }
  };

  // Handle time range changes for chart
  const handleTimeRangeChange = (range: string) => {
    setTimeRange(range);
    setActiveButton(range);
  };

  // Generate chart data based on health metrics and timeRange
  const generateChartData = () => {
    const today = new Date();
    let days = 7;

    if (timeRange === 'month') {
      days = 30;
    } else if (timeRange === 'year') {
      days = 365;
    }

    // Generate mock water data for the chart if no health metrics available
    // In a real app, this would come from real health metrics
    return Array.from({ length: days }).map((_, index) => {
      const date = subDays(today, days - index - 1);
      
      // Random value between 1.5 and 3.5 liters
      const waterIntake = Math.round((1.5 + Math.random() * 2) * 10) / 10;
      
      return {
        date: format(date, 'yyyy-MM-dd'),
        waterIntake
      };
    });
  };

  const chartData = generateChartData();
  const waterTarget = user?.dailyWaterTarget || 3; // Default 3L if not set
  const currentWaterIntake = dailyStats?.waterIntake || 0;
  const waterPercentage = Math.min(Math.round((currentWaterIntake / waterTarget) * 100), 100);

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
        <h1 className="text-2xl font-bold">Water Tracking</h1>
      </div>

      {/* Today's Water Intake */}
      <Card className="dark-card">
        <CardHeader>
          <CardTitle>Today's Water Intake</CardTitle>
          <CardDescription>Your daily hydration goal is {waterTarget}L</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="text-5xl font-bold text-blue-400 mb-2">
              {currentWaterIntake}L
            </div>
            <div className="text-sm text-gray-400">
              of {waterTarget}L goal
            </div>
            <div className="w-full mt-4">
              <Progress value={waterPercentage} className="h-3" />
            </div>
          </div>

          {/* Quick Add Buttons */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => handleAddWater(0.1)}
              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30"
            >
              + 100ml
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAddWater(0.25)}
              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30"
            >
              + 250ml
            </Button>
            <Button
              variant="outline"
              onClick={() => handleAddWater(0.5)}
              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30"
            >
              + 500ml
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Water History Chart */}
      <Card className="dark-card">
        <CardHeader>
          <CardTitle>Water History</CardTitle>
          <div className="flex space-x-2 my-2">
            <Button 
              variant={activeButton === 'week' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => handleTimeRangeChange('week')}
              className={activeButton === 'week' ? 'bg-blue-600' : ''}
            >
              Week
            </Button>
            <Button 
              variant={activeButton === 'month' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => handleTimeRangeChange('month')}
              className={activeButton === 'month' ? 'bg-blue-600' : ''}
            >
              Month
            </Button>
            <Button 
              variant={activeButton === 'year' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => handleTimeRangeChange('year')}
              className={activeButton === 'year' ? 'bg-blue-600' : ''}
            >
              Year
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={formatChartDate}
                  stroke="#6b7280"
                  fontSize={12}
                />
                <YAxis
                  tickFormatter={(value) => `${value}L`}
                  stroke="#6b7280"
                  fontSize={12}
                />
                <Tooltip 
                  labelFormatter={(label) => `Date: ${formatChartDate(label as string)}`}
                  formatter={(value) => [`${value}L`, 'Water Intake']}
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    borderColor: '#374151',
                    color: 'white'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="waterIntake"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#3b82f6', stroke: '#1f2937', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Water Tips */}
      <Card className="dark-card">
        <CardHeader>
          <CardTitle>Hydration Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-300">• Drink water first thing in the morning to rehydrate</p>
          <p className="text-sm text-gray-300">• Carry a water bottle with you throughout the day</p>
          <p className="text-sm text-gray-300">• Set reminders to drink water every hour</p>
          <p className="text-sm text-gray-300">• Eat water-rich foods like cucumber and watermelon</p>
          <p className="text-sm text-gray-300">• Increase water intake during and after exercise</p>
        </CardContent>
      </Card>
    </div>
  );
}