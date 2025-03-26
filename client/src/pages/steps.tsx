import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Loader2 } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';

// Helper function to format date for display
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatChartDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export default function StepsPage() {
  const { toast } = useToast();
  const [stepGoal, setStepGoal] = useState<number>(0);
  const [timeRange, setTimeRange] = useState<string>('week'); // day, week, month, 6months, year
  
  // Fetch user data
  const { data: user, isLoading: isLoadingUser } = useQuery({
    queryKey: ['/api/user/1'],
    queryFn: async () => {
      const res = await fetch('/api/user/1');
      if (!res.ok) throw new Error('Failed to fetch user data');
      return res.json();
    }
  });

  // Fetch daily stats
  const { data: dailyStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['/api/users/1/daily-stats'],
    queryFn: async () => {
      const res = await fetch('/api/users/1/daily-stats');
      if (!res.ok) throw new Error('Failed to fetch daily stats');
      return res.json();
    }
  });

  // Fetch step history data based on selected time range
  const { data: stepHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/users/1/step-history', timeRange],
    queryFn: async () => {
      // This would normally fetch step history for the selected time range
      // For now, we'll generate sample data
      
      const today = new Date();
      const data = [];
      
      let days = 7;
      if (timeRange === 'day') days = 1;
      if (timeRange === 'week') days = 7;
      if (timeRange === 'month') days = 30;
      if (timeRange === '6months') days = 180;
      if (timeRange === 'year') days = 365;
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        
        // Generate realistic step data with some variation
        // Base it on the user's daily step target
        const target = user?.dailyStepTarget || 10000;
        const variance = Math.random() * 0.5 + 0.75; // Between 75% and 125%
        const steps = Math.round(target * variance);
        
        data.push({
          date: formatChartDate(date),
          steps,
        });
      }
      
      return data;
    },
    enabled: !!user,
  });

  // Update step goal mutation
  const updateStepGoalMutation = useMutation({
    mutationFn: async (newGoal: number) => {
      const res = await apiRequest('PATCH', `/api/user/1`, {
        dailyStepTarget: newGoal
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/1'] });
      toast({
        title: "Goal updated",
        description: "Your daily step goal has been updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update goal",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (user?.dailyStepTarget) {
      setStepGoal(user.dailyStepTarget);
    }
  }, [user]);

  const handleSaveGoal = () => {
    updateStepGoalMutation.mutate(stepGoal);
  };

  const calculateAverageSteps = () => {
    if (!stepHistory?.length) return 0;
    const sum = stepHistory.reduce((acc, day) => acc + day.steps, 0);
    return Math.round(sum / stepHistory.length);
  };

  const calculateTotalSteps = () => {
    if (!stepHistory?.length) return 0;
    return stepHistory.reduce((acc, day) => acc + day.steps, 0);
  };

  if (isLoadingUser || isLoadingStats) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-white">Step Tracking</h1>
      
      {/* Step Goal Setting Card */}
      <Card className="bg-gray-800 border border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Daily Step Goal</CardTitle>
          <CardDescription>Set your target steps for each day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Input 
              type="number" 
              value={stepGoal}
              onChange={(e) => setStepGoal(parseInt(e.target.value) || 0)}
              className="bg-gray-700 border-gray-600 text-white"
            />
            <Button 
              onClick={handleSaveGoal}
              disabled={updateStepGoalMutation.isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {updateStepGoalMutation.isPending ? 
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-gray-400">
            Current progress: {dailyStats?.stepsCount || 0} / {user?.dailyStepTarget || 0} steps
            ({Math.round(((dailyStats?.stepsCount || 0) / (user?.dailyStepTarget || 1)) * 100)}%)
          </p>
        </CardFooter>
      </Card>
      
      {/* Step History Graph */}
      <Card className="bg-gray-800 border border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Step History</CardTitle>
          <Tabs defaultValue="week" className="w-full" onValueChange={setTimeRange}>
            <TabsList className="bg-gray-700">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="6months">6 Months</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stepHistory}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSteps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: '#aaa' }} 
                    tickMargin={10}
                  />
                  <YAxis 
                    tick={{ fill: '#aaa' }} 
                    tickMargin={10}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#333', 
                      border: '1px solid #555',
                      color: '#fff'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="steps" 
                    stroke="#3B82F6" 
                    fillOpacity={1} 
                    fill="url(#colorSteps)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-gray-400">
            Average: <span className="text-primary font-medium">{calculateAverageSteps().toLocaleString()}</span> steps
          </div>
          <div className="text-sm text-gray-400">
            Total: <span className="text-primary font-medium">{calculateTotalSteps().toLocaleString()}</span> steps
          </div>
        </CardFooter>
      </Card>
      
      {/* Health Insights */}
      <Card className="bg-gray-800 border border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-gray-700 rounded-lg border border-gray-600">
            <h3 className="font-medium text-white mb-2">Health Benefits</h3>
            <p className="text-gray-300 text-sm">
              Walking 10,000 steps can burn approximately 300-500 calories, improve cardiovascular health, 
              and reduce the risk of chronic diseases. Regular walking also strengthens muscles, improves 
              mood, and enhances sleep quality.
            </p>
          </div>
          
          <div className="p-4 bg-gray-700 rounded-lg border border-gray-600">
            <h3 className="font-medium text-white mb-2">Tips to Increase Steps</h3>
            <ul className="text-gray-300 text-sm list-disc list-inside space-y-1">
              <li>Take the stairs instead of elevators</li>
              <li>Park farther away from entrances</li>
              <li>Take walking meetings</li>
              <li>Set hourly reminders to walk</li>
              <li>Walk while taking phone calls</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}