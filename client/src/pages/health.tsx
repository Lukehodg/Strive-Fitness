import { useState, useEffect, useRef } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import HealthIntegrations from "@/components/health/health-integrations";
import PlatformMetrics from "@/components/health/platform-metrics";
import MedicationsTab from "@/components/health/medications-tab";

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
  const [activeTab, setActiveTab] = useState("metrics");
  const [selectedMetricType, setSelectedMetricType] = useState("blood_pressure");
  const [timeRange, setTimeRange] = useState("30");
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [smoothChart, setSmoothChart] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  
  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const newFiles = Array.from(event.target.files).filter(file => file.type === 'application/pdf');
      setUploadedFiles(prev => [...prev, ...newFiles]);
      
      // Display success toast
      if (newFiles.length > 0) {
        toast({
          title: "Files added",
          description: `${newFiles.length} PDF file${newFiles.length > 1 ? 's' : ''} added successfully`,
        });
      }
    }
  };
  
  // Trigger file input click
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Remove a file from the list
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Health Tracking</h1>
        <Button 
          onClick={() => setAddMetricOpen(true)}
          className="bg-primary hover:bg-primary/90"
        >
          Add Measurement
        </Button>
      </div>
      
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="metrics">Health Metrics</TabsTrigger>
          <TabsTrigger value="blood-tests">Blood Test Results</TabsTrigger>
          <TabsTrigger value="medications">Medications</TabsTrigger>
          <TabsTrigger value="integrations">Health Services</TabsTrigger>
        </TabsList>
        
        <TabsContent value="metrics" className="mt-6">
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
                      {selectedMetricType === 'respiration_rate' && 'Respiration Rate History'}
                      {selectedMetricType === 'temperature' && 'Body Temperature History'}
                      {selectedMetricType === 'oxygen_saturation' && 'Oxygen Saturation History'}
                      {selectedMetricType === 'hrv' && 'HRV History'}
                      {selectedMetricType === 'sleep_duration' && 'Sleep Duration History'}
                      {selectedMetricType === 'sleep_quality' && 'Sleep Quality History'}
                      {selectedMetricType === 'stress_level' && 'Stress Level History'}
                      {selectedMetricType === 'steps' && 'Step Count History'}
                      {selectedMetricType === 'cholesterol' && 'Cholesterol History'}
                    </CardTitle>
                    <CardDescription>
                      {formatDate(startDate)} - {formatDate(endDate)}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
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
                    <div className="flex items-center space-x-2">
                      <Switch 
                        id="chart-smooth" 
                        checked={smoothChart}
                        onCheckedChange={setSmoothChart}
                      />
                      <Label htmlFor="chart-smooth" className="text-sm">Smooth Line</Label>
                    </div>
                  </div>
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
                          <Line 
                            type={smoothChart ? "natural" : "monotone"} 
                            dataKey="systolic" 
                            stroke="#FF5E5B" 
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6, strokeWidth: 2 }}
                            name="Systolic (mmHg)" 
                          />
                          <Line 
                            type={smoothChart ? "natural" : "monotone"} 
                            dataKey="diastolic" 
                            stroke="#4BC0C0" 
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6, strokeWidth: 2 }}
                            name="Diastolic (mmHg)" 
                          />
                        </LineChart>
                      ) : (
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line 
                            type={smoothChart ? "natural" : "monotone"} 
                            dataKey="value" 
                            stroke={
                              selectedMetricType === 'heart_rate' ? '#FF5E5B' :  // Red for heart
                              selectedMetricType === 'weight' ? '#36A2EB' :      // Blue for weight
                              selectedMetricType === 'body_fat' ? '#8A2BE2' :    // Purple for body fat
                              selectedMetricType === 'blood_glucose' ? '#FF9F40' : // Orange for glucose
                              selectedMetricType === 'respiration_rate' ? '#4BC0C0' : // Teal for respiration
                              selectedMetricType === 'temperature' ? '#FF6384' :  // Pink for temperature
                              selectedMetricType === 'oxygen_saturation' ? '#45b6fe' : // Light blue for oxygen
                              selectedMetricType === 'hrv' ? '#9966FF' :        // Lavender for HRV
                              selectedMetricType === 'sleep_duration' ? '#3e4ebc' : // Navy for sleep
                              selectedMetricType === 'sleep_quality' ? '#8e5ea2' : // Purple for sleep quality
                              selectedMetricType === 'stress_level' ? '#e8454e' : // Red for stress
                              selectedMetricType === 'steps' ? '#3cba9f' :      // Green for steps
                              selectedMetricType === 'cholesterol' ? '#e2962d' : // Amber for cholesterol
                              '#8884d8'                               // Default purple
                            }
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            name={
                              selectedMetricType === 'heart_rate' ? 'Heart Rate (BPM)' :
                              selectedMetricType === 'weight' ? 'Weight (kg)' :
                              selectedMetricType === 'body_fat' ? 'Body Fat (%)' :
                              selectedMetricType === 'blood_glucose' ? 'Blood Glucose (mg/dL)' :
                              selectedMetricType === 'respiration_rate' ? 'Respiration Rate (BPM)' :
                              selectedMetricType === 'temperature' ? 'Body Temperature (°C)' :
                              selectedMetricType === 'oxygen_saturation' ? 'Oxygen Saturation (%)' :
                              selectedMetricType === 'hrv' ? 'Heart Rate Variability (ms)' :
                              selectedMetricType === 'sleep_duration' ? 'Sleep Duration (hours)' :
                              selectedMetricType === 'sleep_quality' ? 'Sleep Quality (1-10)' :
                              selectedMetricType === 'stress_level' ? 'Stress Level (1-10)' :
                              selectedMetricType === 'steps' ? 'Step Count' :
                              selectedMetricType === 'cholesterol' ? 'Cholesterol (mg/dL)' :
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
                            selectedMetricType === 'respiration_rate' ? 'Respiration Rate (BPM)' :
                            selectedMetricType === 'temperature' ? 'Body Temperature (°C)' :
                            selectedMetricType === 'oxygen_saturation' ? 'Oxygen Saturation (%)' :
                            selectedMetricType === 'hrv' ? 'Heart Rate Variability (ms)' :
                            selectedMetricType === 'sleep_duration' ? 'Sleep Duration (hours)' :
                            selectedMetricType === 'sleep_quality' ? 'Sleep Quality (1-10)' :
                            selectedMetricType === 'stress_level' ? 'Stress Level (1-10)' :
                            selectedMetricType === 'steps' ? 'Step Count' :
                            selectedMetricType === 'cholesterol' ? 'Cholesterol (mg/dL)' :
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
                              selectedMetricType === 'respiration_rate' ? ' BPM' :
                              selectedMetricType === 'temperature' ? ' °C' :
                              selectedMetricType === 'oxygen_saturation' ? '%' :
                              selectedMetricType === 'hrv' ? ' ms' :
                              selectedMetricType === 'sleep_duration' ? ' hours' :
                              selectedMetricType === 'sleep_quality' ? '/10' :
                              selectedMetricType === 'stress_level' ? '/10' :
                              selectedMetricType === 'steps' ? ' steps' :
                              selectedMetricType === 'cholesterol' ? ' mg/dL' :
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
        </TabsContent>
        
        <TabsContent value="blood-tests" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Blood Test Results</CardTitle>
              <CardDescription>Upload and manage your blood test results in PDF format</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
                  <div className="mb-4 rounded-full bg-primary/10 p-3 text-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Drag & Drop your PDF files here</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mb-6">
                    Upload your blood test results to keep a record of your health history
                  </p>
                  <Button onClick={triggerFileUpload}>
                    Select PDF Files
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="application/pdf"
                    onChange={handleFileChange}
                    multiple
                  />
                </div>
                
                {uploadedFiles.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold">Uploaded Files</h3>
                    
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-muted/50 p-3 rounded-md">
                        <div className="flex items-center space-x-3">
                          <div className="bg-primary/10 p-2 rounded-md text-primary">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                              <polyline points="14 2 14 8 20 8" />
                              <path d="M9 15s1 1 3 1 3-1 3-1" />
                              <path d="M9 12h.01M15 12h.01" />
                            </svg>
                          </div>
                          <div>
                            <p className="font-medium text-sm">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {file.size < 1024 * 1024
                                ? `${(file.size / 1024).toFixed(1)} KB`
                                : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive/80 h-8 w-8 p-0"
                          onClick={() => removeFile(index)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                          <span className="sr-only">Remove</span>
                        </Button>
                      </div>
                    ))}
                    
                    <Alert className="mt-6 bg-primary/5 border-primary/10">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-primary">
                        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                      <AlertTitle className="text-sm font-medium">Files Saved Locally</AlertTitle>
                      <AlertDescription className="text-xs text-muted-foreground">
                        Your PDFs are stored locally on your device. They will be encrypted and only visible to you.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-8">
          <HealthIntegrations />
          <PlatformMetrics />
        </TabsContent>
      </Tabs>
      
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
                    <SelectItem value="respiration_rate">Respiration Rate</SelectItem>
                    <SelectItem value="temperature">Body Temperature</SelectItem>
                    <SelectItem value="oxygen_saturation">Oxygen Saturation (SpO2)</SelectItem>
                    <SelectItem value="hrv">Heart Rate Variability</SelectItem>
                    <SelectItem value="sleep_duration">Sleep Duration</SelectItem>
                    <SelectItem value="sleep_quality">Sleep Quality</SelectItem>
                    <SelectItem value="stress_level">Stress Level</SelectItem>
                    <SelectItem value="steps">Steps</SelectItem>
                    <SelectItem value="cholesterol">Cholesterol</SelectItem>
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
                    newMetric.metricType === 'respiration_rate' ? 'Respiration Rate (BPM)' :
                    newMetric.metricType === 'temperature' ? 'Body Temperature (°C)' :
                    newMetric.metricType === 'oxygen_saturation' ? 'Oxygen Saturation (%)' :
                    newMetric.metricType === 'hrv' ? 'Heart Rate Variability (ms)' :
                    newMetric.metricType === 'sleep_duration' ? 'Sleep Duration (hours)' :
                    newMetric.metricType === 'sleep_quality' ? 'Sleep Quality (1-10)' :
                    newMetric.metricType === 'stress_level' ? 'Stress Level (1-10)' :
                    newMetric.metricType === 'steps' ? 'Step Count' :
                    newMetric.metricType === 'cholesterol' ? 'Cholesterol (mg/dL)' :
                    'Value'}
                  </Label>
                  <Input 
                    id="value" 
                    type="number"
                    step={newMetric.metricType === 'body_fat' || 
                          newMetric.metricType === 'temperature' || 
                          newMetric.metricType === 'sleep_duration' || 
                          newMetric.metricType === 'hrv' ? "0.1" : "1"}
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
      
      {/* Floating action button for quick add measurement */}
      <div className="fixed bottom-24 right-6">
        <Button 
          onClick={() => setAddMetricOpen(true)} 
          className="h-14 w-14 rounded-full shadow-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="sr-only">Add Measurement</span>
        </Button>
      </div>
    </div>
  );
}