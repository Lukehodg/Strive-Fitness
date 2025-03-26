import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Define available metrics for each platform
const platformMetrics = {
  apple_health: {
    name: "Apple Health",
    logo: "🍎",
    metrics: [
      { name: "Heart Rate", description: "Beats per minute (BPM)" },
      { name: "Blood Pressure", description: "Systolic and diastolic measurements" },
      { name: "Weight", description: "Body weight in kg" },
      { name: "Body Fat", description: "Body fat percentage" },
      { name: "Blood Glucose", description: "Blood sugar levels in mg/dL" },
      { name: "Oxygen Saturation", description: "SpO2 percentage" },
      { name: "Steps", description: "Daily step count" },
      { name: "Sleep Analysis", description: "Sleep duration and quality" }
    ]
  },
  garmin: {
    name: "Garmin Connect",
    logo: "⌚",
    metrics: [
      { name: "Heart Rate", description: "Continuous heart rate monitoring" },
      { name: "Sleep Data", description: "Sleep cycles and efficiency" },
      { name: "Stress Level", description: "All-day stress tracking" },
      { name: "Activities", description: "Running, cycling, swimming, etc." },
      { name: "Body Battery", description: "Energy monitoring" },
      { name: "Respiration Rate", description: "Breaths per minute" },
      { name: "Pulse Ox", description: "Blood oxygen saturation" }
    ]
  },
  android_health: {
    name: "Android Health",
    logo: "🤖",
    metrics: [
      { name: "Heart Rate", description: "Heart rate measurements" },
      { name: "Step Count", description: "Daily steps" },
      { name: "Sleep Analysis", description: "Sleep stages and duration" },
      { name: "Weight", description: "Weight measurements" },
      { name: "Blood Pressure", description: "Systolic and diastolic" },
      { name: "Blood Glucose", description: "Blood sugar monitoring" },
      { name: "Activities", description: "Exercise and movement data" }
    ]
  },
  whoop: {
    name: "WHOOP",
    logo: "🔄",
    metrics: [
      { name: "Heart Rate", description: "Continuous heart rate" },
      { name: "HRV", description: "Heart rate variability" },
      { name: "Recovery", description: "Daily recovery percentage" },
      { name: "Sleep Performance", description: "Sleep quality metrics" },
      { name: "Strain", description: "Daily cardiovascular load" },
      { name: "Respiration Rate", description: "Breaths per minute" },
      { name: "Sleep Cycles", description: "REM, deep, and light sleep" }
    ]
  },
  oura: {
    name: "Oura Ring",
    logo: "💍",
    metrics: [
      { name: "Readiness Score", description: "Daily readiness assessment" },
      { name: "Sleep Score", description: "Sleep quality metrics" },
      { name: "Heart Rate", description: "Resting heart rate" },
      { name: "HRV", description: "Heart rate variability" },
      { name: "Body Temperature", description: "Nocturnal temperature" },
      { name: "Respiration Rate", description: "Breathing rate during sleep" },
      { name: "Activity Score", description: "Daily activity metrics" }
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
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-md flex items-center justify-center bg-primary/10 text-2xl">
                    {platform.logo}
                  </div>
                  <h3 className="text-xl font-semibold">{platform.name}</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pl-12">
                  {platform.metrics.map((metric, index) => (
                    <div key={index} className="border rounded-lg p-3 bg-card">
                      <h4 className="font-medium mb-1">{metric.name}</h4>
                      <p className="text-sm text-muted-foreground">{metric.description}</p>
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