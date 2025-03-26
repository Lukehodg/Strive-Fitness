import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Define available metrics for each platform
const platformMetrics = {
  apple_health: {
    name: "Apple Health",
    logo: "🍎",
    description: "Apple's comprehensive health tracking platform for iOS devices",
    metrics: [
      { name: "Heart Rate", description: "Beats per minute (BPM)", frequency: "Continuous/Manual", accuracy: "High" },
      { name: "Blood Pressure", description: "Systolic and diastolic measurements", frequency: "Manual entry", accuracy: "User dependent" },
      { name: "Weight", description: "Body weight in kg", frequency: "Manual/Connected scales", accuracy: "High" },
      { name: "Body Fat", description: "Body fat percentage", frequency: "Manual/Connected devices", accuracy: "Moderate" },
      { name: "Blood Glucose", description: "Blood sugar levels in mg/dL", frequency: "Manual/Connected meters", accuracy: "High" },
      { name: "Oxygen Saturation", description: "SpO2 percentage", frequency: "Periodic/On demand", accuracy: "Moderate" },
      { name: "Steps", description: "Daily step count", frequency: "Continuous", accuracy: "Moderate" },
      { name: "Sleep Analysis", description: "Sleep duration and quality", frequency: "Nightly", accuracy: "Moderate" },
      { name: "Temperature", description: "Body temperature readings", frequency: "Manual/Connected devices", accuracy: "High" },
      { name: "HRV", description: "Heart rate variability measurements", frequency: "Periodic", accuracy: "Moderate" },
      { name: "Respiratory Rate", description: "Breaths per minute", frequency: "During sleep", accuracy: "Moderate" }
    ]
  },
  garmin: {
    name: "Garmin Connect",
    logo: "⌚",
    description: "Health and activity tracking platform for Garmin wearable devices",
    metrics: [
      { name: "Heart Rate", description: "Continuous heart rate monitoring", frequency: "Continuous", accuracy: "High" },
      { name: "Sleep Data", description: "Sleep cycles and efficiency", frequency: "Nightly", accuracy: "Moderate" },
      { name: "Stress Level", description: "All-day stress tracking", frequency: "Throughout day", accuracy: "Moderate" },
      { name: "Activities", description: "Running, cycling, swimming, etc.", frequency: "Per activity", accuracy: "High" },
      { name: "Body Battery", description: "Energy monitoring", frequency: "Continuous", accuracy: "Moderate" },
      { name: "Respiration Rate", description: "Breaths per minute", frequency: "During sleep/activities", accuracy: "Moderate" },
      { name: "Pulse Ox", description: "Blood oxygen saturation", frequency: "Periodic/Sleep", accuracy: "Moderate" },
      { name: "HRV", description: "Heart rate variability", frequency: "During sleep", accuracy: "Moderate" },
      { name: "Training Status", description: "Fitness and recovery status", frequency: "Daily", accuracy: "Moderate" },
      { name: "Weight", description: "Body weight tracking", frequency: "Manual/Connected scales", accuracy: "High" }
    ]
  },
  android_health: {
    name: "Android Health",
    logo: "🤖",
    description: "Google's health platform for Android devices and Wear OS",
    metrics: [
      { name: "Heart Rate", description: "Heart rate measurements", frequency: "Continuous/Manual", accuracy: "Moderate" },
      { name: "Step Count", description: "Daily steps", frequency: "Continuous", accuracy: "Moderate" },
      { name: "Sleep Analysis", description: "Sleep stages and duration", frequency: "Nightly", accuracy: "Moderate" },
      { name: "Weight", description: "Weight measurements", frequency: "Manual/Connected scales", accuracy: "High" },
      { name: "Blood Pressure", description: "Systolic and diastolic", frequency: "Manual entry", accuracy: "User dependent" },
      { name: "Blood Glucose", description: "Blood sugar monitoring", frequency: "Manual/Connected devices", accuracy: "High" },
      { name: "Activities", description: "Exercise and movement data", frequency: "Per activity", accuracy: "Moderate" },
      { name: "Respiratory Rate", description: "Breathing rate tracking", frequency: "During sleep", accuracy: "Moderate" },
      { name: "SpO2", description: "Blood oxygen levels", frequency: "Periodic/Sleep", accuracy: "Moderate" },
      { name: "Body Temperature", description: "Temperature readings", frequency: "Manual/Connected devices", accuracy: "High" }
    ]
  },
  whoop: {
    name: "WHOOP",
    logo: "🔄",
    description: "Advanced recovery and performance tracking wearable system",
    metrics: [
      { name: "Heart Rate", description: "Continuous heart rate", frequency: "Continuous", accuracy: "High" },
      { name: "HRV", description: "Heart rate variability", frequency: "During sleep", accuracy: "High" },
      { name: "Recovery", description: "Daily recovery percentage", frequency: "Daily", accuracy: "Moderate-High" },
      { name: "Sleep Performance", description: "Sleep quality metrics", frequency: "Nightly", accuracy: "High" },
      { name: "Strain", description: "Daily cardiovascular load", frequency: "Continuous", accuracy: "High" },
      { name: "Respiration Rate", description: "Breaths per minute", frequency: "During sleep", accuracy: "High" },
      { name: "Sleep Cycles", description: "REM, deep, and light sleep", frequency: "Nightly", accuracy: "Moderate-High" },
      { name: "Calories Burned", description: "Energy expenditure", frequency: "Daily/Per activity", accuracy: "Moderate" },
      { name: "Stress", description: "Physiological stress levels", frequency: "Throughout day", accuracy: "Moderate-High" },
      { name: "Activity Detection", description: "Automatic activity tracking", frequency: "Throughout day", accuracy: "Moderate" }
    ]
  },
  oura: {
    name: "Oura Ring",
    logo: "💍",
    description: "Advanced sleep and recovery tracking ring wearable",
    metrics: [
      { name: "Readiness Score", description: "Daily readiness assessment", frequency: "Daily", accuracy: "Moderate-High" },
      { name: "Sleep Score", description: "Sleep quality metrics", frequency: "Nightly", accuracy: "High" },
      { name: "Heart Rate", description: "Resting heart rate", frequency: "Continuous", accuracy: "High" },
      { name: "HRV", description: "Heart rate variability", frequency: "Nightly", accuracy: "High" },
      { name: "Body Temperature", description: "Nocturnal temperature", frequency: "Nightly", accuracy: "High" },
      { name: "Respiration Rate", description: "Breathing rate during sleep", frequency: "Nightly", accuracy: "High" },
      { name: "Activity Score", description: "Daily activity metrics", frequency: "Daily", accuracy: "Moderate" },
      { name: "Sleep Stages", description: "REM, deep, light sleep tracking", frequency: "Nightly", accuracy: "High" },
      { name: "Nap Detection", description: "Automatic nap tracking", frequency: "When napping", accuracy: "Moderate-High" },
      { name: "Restfulness", description: "Sleep quality analysis", frequency: "Nightly", accuracy: "High" }
    ]
  }
};

export default function PlatformMetrics() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Available Health Metrics by Platform</CardTitle>
          <CardDescription>
            Discover the health data you can import from each connected platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {Object.entries(platformMetrics).map(([platformId, platform]) => (
              <div key={platformId} className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-10 w-10 rounded-md flex items-center justify-center bg-primary/10 text-2xl">
                    {platform.logo}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold">{platform.name}</h3>
                    <p className="text-sm text-muted-foreground">{platform.description}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pl-4 md:pl-12">
                  {platform.metrics.map((metric, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
                      <h4 className="font-medium mb-1 flex items-center">
                        {metric.name}
                        <Badge variant="outline" className="ml-2 text-xs font-normal">
                          {metric.accuracy}
                        </Badge>
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">{metric.description}</p>
                      <div className="flex items-center text-xs text-muted-foreground mt-2">
                        <span className="mr-4">
                          <span className="font-medium text-primary/80">Frequency:</span> {metric.frequency}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Data Integration Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Comprehensive Health Overview</h3>
              <p className="text-muted-foreground">
                By connecting multiple platforms, Strive can aggregate data from different sources to provide a complete picture of your health.
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Automatic Tracking</h3>
              <p className="text-muted-foreground">
                Get your health data automatically imported without manual entry, ensuring more consistent tracking.
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Personalized Insights</h3>
              <p className="text-muted-foreground">
                With more data points, Strive can provide more accurate and personalized health insights and recommendations.
              </p>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Trend Analysis</h3>
              <p className="text-muted-foreground">
                Track changes over time across multiple health metrics to better understand correlations and patterns.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}