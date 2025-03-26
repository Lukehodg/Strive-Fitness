import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useParams } from "wouter";
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Helper functions for date manipulation and formatting
function formatDate(date: Date): string {
  return format(date, 'MMM dd, yyyy');
}

function formatChartDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  return format(date, 'MM/dd');
}

// Main Health Page Component
export default function HealthPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedMetricType, setSelectedMetricType] = useState("blood_pressure");
  const [timeRange, setTimeRange] = useState("30");
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get current user (hardcoded to id 1 for now)
  const userId = 1;
  
  // Calculate date range based on selected time range
  const endDate = endOfDay(new Date());
  const startDate = startOfDay(subDays(endDate, parseInt(timeRange)));
  
  // Fetch health metrics for the selected time range and type
  const { data: healthMetrics = [], isLoading } = useQuery({
    queryKey: ['/api/users/1/health-metrics', selectedMetricType, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/health-metrics?type=${selectedMetricType}&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`);
      if (!res.ok) throw new Error('Failed to fetch health metrics');
      return res.json();
    }
  });
  
  // Form state for adding new metrics
  const [newMetric, setNewMetric] = useState({
    metricType: selectedMetricType,
    value: '',
    systolic: '',
    diastolic: '',
    notes: '',
    timestamp: format(new Date(), 'yyyy-MM-dd\'T\'HH:mm')
  });
  
  // Mutation for adding a new health metric
  const addMetricMutation = useMutation({
    mutationFn: async (metricData: any) => {
      const res = await fetch('/api/health-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...metricData,
          userId
        })
      });
      
      if (!res.ok) throw new Error('Failed to add health metric');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/health-metrics'] });
      setAddMetricOpen(false);
      toast({
        title: "Success",
        description: "Health metric added successfully",
      });
      
      // Reset form
      setNewMetric({
        metricType: selectedMetricType,
        value: '',
        systolic: '',
        diastolic: '',
        notes: '',
        timestamp: format(new Date(), 'yyyy-MM-dd\'T\'HH:mm')
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to add health metric: ${error.message}`,
        variant: "destructive"
      });
    }
  });
  
  // Handle form submission
  const handleAddMetric = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare the data based on the metric type
    const metricData: any = {
      metricType: newMetric.metricType,
      timestamp: new Date(newMetric.timestamp),
      notes: newMetric.notes || null
    };
    
    // Add type-specific fields
    if (newMetric.metricType === 'blood_pressure') {
      metricData.systolic = parseInt(newMetric.systolic);
      metricData.diastolic = parseInt(newMetric.diastolic);
    } else {
      metricData.value = parseFloat(newMetric.value);
    }
    
    addMetricMutation.mutate(metricData);
  };
  
  // Update the form whenever the selected metric type changes
  useEffect(() => {
    setNewMetric(prev => ({
      ...prev,
      metricType: selectedMetricType
    }));
  }, [selectedMetricType]);
  
  // Prepare chart data based on the metric type
  const prepareChartData = () => {
    if (!healthMetrics.length) return [];
    
    return healthMetrics.map((metric: any) => {
      const date = formatChartDate(metric.timestamp);
      
      if (metric.metricType === 'blood_pressure') {
        return {
          date,
          systolic: metric.systolic,
          diastolic: metric.diastolic
        };
      } else {
        return {
          date,
          value: metric.value
        };
      }
    });
  };
  
  const chartData = prepareChartData();
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Health Tracking</h1>
        <Button onClick={() => setAddMetricOpen(true)}>Add New Measurement</Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
            <CardDescription>Choose a health metric to track</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div 
                className={`p-3 rounded-md cursor-pointer ${selectedMetricType === 'blood_pressure' ? 'bg-primary/10' : 'hover:bg-muted'}`}
                onClick={() => setSelectedMetricType('blood_pressure')}
              >
                <h3 className="font-medium">Blood Pressure</h3>
                <p className="text-sm text-muted-foreground">Systolic/Diastolic (mmHg)</p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer ${selectedMetricType === 'heart_rate' ? 'bg-primary/10' : 'hover:bg-muted'}`}
                onClick={() => setSelectedMetricType('heart_rate')}
              >
                <h3 className="font-medium">Heart Rate</h3>
                <p className="text-sm text-muted-foreground">Beats per minute (BPM)</p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer ${selectedMetricType === 'weight' ? 'bg-primary/10' : 'hover:bg-muted'}`}
                onClick={() => setSelectedMetricType('weight')}
              >
                <h3 className="font-medium">Weight</h3>
                <p className="text-sm text-muted-foreground">Kilograms (kg)</p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer ${selectedMetricType === 'body_fat' ? 'bg-primary/10' : 'hover:bg-muted'}`}
                onClick={() => setSelectedMetricType('body_fat')}
              >
                <h3 className="font-medium">Body Fat</h3>
                <p className="text-sm text-muted-foreground">Percentage (%)</p>
              </div>
              
              <div 
                className={`p-3 rounded-md cursor-pointer ${selectedMetricType === 'blood_glucose' ? 'bg-primary/10' : 'hover:bg-muted'}`}
                onClick={() => setSelectedMetricType('blood_glucose')}
              >
                <h3 className="font-medium">Blood Glucose</h3>
                <p className="text-sm text-muted-foreground">mg/dL</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>
                  {selectedMetricType === 'blood_pressure' && 'Blood Pressure History'}
                  {selectedMetricType === 'heart_rate' && 'Heart Rate History'}
                  {selectedMetricType === 'weight' && 'Weight History'}
                  {selectedMetricType === 'body_fat' && 'Body Fat History'}
                  {selectedMetricType === 'blood_glucose' && 'Blood Glucose History'}
                </CardTitle>
                <CardDescription>
                  {formatDate(startDate)} - {formatDate(endDate)}
                </CardDescription>
              </div>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last Week</SelectItem>
                  <SelectItem value="30">Last Month</SelectItem>
                  <SelectItem value="90">Last 3 Months</SelectItem>
                  <SelectItem value="180">Last 6 Months</SelectItem>
                  <SelectItem value="365">Last Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-80 flex items-center justify-center">
                <p>Loading health metrics...</p>
              </div>
            ) : healthMetrics.length === 0 ? (
              <div className="h-80 flex items-center justify-center flex-col">
                <p className="text-muted-foreground mb-2">No data available for this period</p>
                <Button onClick={() => setAddMetricOpen(true)}>Add First Measurement</Button>
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  {selectedMetricType === 'blood_pressure' ? (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="systolic" stroke="#8884d8" name="Systolic" />
                      <Line type="monotone" dataKey="diastolic" stroke="#82ca9d" name="Diastolic" />
                    </LineChart>
                  ) : (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#8884d8" 
                        name={
                          selectedMetricType === 'heart_rate' ? 'Heart Rate (BPM)' :
                          selectedMetricType === 'weight' ? 'Weight (kg)' :
                          selectedMetricType === 'body_fat' ? 'Body Fat (%)' :
                          selectedMetricType === 'blood_glucose' ? 'Blood Glucose (mg/dL)' :
                          'Value'
                        }
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {healthMetrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Measurements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Date</th>
                    {selectedMetricType === 'blood_pressure' ? (
                      <>
                        <th className="text-left p-2">Systolic</th>
                        <th className="text-left p-2">Diastolic</th>
                      </>
                    ) : (
                      <th className="text-left p-2">
                        {selectedMetricType === 'heart_rate' ? 'Heart Rate (BPM)' :
                        selectedMetricType === 'weight' ? 'Weight (kg)' :
                        selectedMetricType === 'body_fat' ? 'Body Fat (%)' :
                        selectedMetricType === 'blood_glucose' ? 'Blood Glucose (mg/dL)' :
                        'Value'}
                      </th>
                    )}
                    <th className="text-left p-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {healthMetrics.slice(0, 5).map((metric: any) => (
                    <tr key={metric.id} className="border-b border-muted">
                      <td className="p-2">{formatDate(new Date(metric.timestamp))}</td>
                      {selectedMetricType === 'blood_pressure' ? (
                        <>
                          <td className="p-2">{metric.systolic} mmHg</td>
                          <td className="p-2">{metric.diastolic} mmHg</td>
                        </>
                      ) : (
                        <td className="p-2">
                          {metric.value}
                          {selectedMetricType === 'heart_rate' ? ' BPM' :
                          selectedMetricType === 'weight' ? ' kg' :
                          selectedMetricType === 'body_fat' ? '%' :
                          selectedMetricType === 'blood_glucose' ? ' mg/dL' :
                          ''}
                        </td>
                      )}
                      <td className="p-2">{metric.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Dialog for adding new health metrics */}
      <Dialog open={addMetricOpen} onOpenChange={setAddMetricOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleAddMetric}>
            <DialogHeader>
              <DialogTitle>Add New Health Measurement</DialogTitle>
              <DialogDescription>
                Enter the details for your new health measurement.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="metricType">Measurement Type</Label>
                <Select 
                  value={newMetric.metricType} 
                  onValueChange={(value) => setNewMetric({...newMetric, metricType: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select measurement type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blood_pressure">Blood Pressure</SelectItem>
                    <SelectItem value="heart_rate">Heart Rate</SelectItem>
                    <SelectItem value="weight">Weight</SelectItem>
                    <SelectItem value="body_fat">Body Fat</SelectItem>
                    <SelectItem value="blood_glucose">Blood Glucose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {newMetric.metricType === 'blood_pressure' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="systolic">Systolic (mmHg)</Label>
                    <Input 
                      id="systolic" 
                      type="number" 
                      value={newMetric.systolic}
                      onChange={(e) => setNewMetric({...newMetric, systolic: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="diastolic">Diastolic (mmHg)</Label>
                    <Input 
                      id="diastolic" 
                      type="number" 
                      value={newMetric.diastolic}
                      onChange={(e) => setNewMetric({...newMetric, diastolic: e.target.value})}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="value">
                    {newMetric.metricType === 'heart_rate' ? 'Heart Rate (BPM)' :
                    newMetric.metricType === 'weight' ? 'Weight (kg)' :
                    newMetric.metricType === 'body_fat' ? 'Body Fat (%)' :
                    newMetric.metricType === 'blood_glucose' ? 'Blood Glucose (mg/dL)' :
                    'Value'}
                  </Label>
                  <Input 
                    id="value" 
                    type="number"
                    step={newMetric.metricType === 'body_fat' ? "0.1" : "1"}
                    value={newMetric.value}
                    onChange={(e) => setNewMetric({...newMetric, value: e.target.value})}
                    required
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="timestamp">Date & Time</Label>
                <Input 
                  id="timestamp" 
                  type="datetime-local" 
                  value={newMetric.timestamp}
                  onChange={(e) => setNewMetric({...newMetric, timestamp: e.target.value})}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Add any notes about this measurement"
                  value={newMetric.notes}
                  onChange={(e) => setNewMetric({...newMetric, notes: e.target.value})}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                type="button" 
                onClick={() => setAddMetricOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addMetricMutation.isPending}>
                {addMetricMutation.isPending ? 'Saving...' : 'Save Measurement'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}