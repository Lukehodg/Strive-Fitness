import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import PlatformMetrics from '@/components/health/platform-metrics';

interface HealthPlatform {
  id: 'apple_health' | 'garmin' | 'android_health' | 'whoop' | 'oura';
  name: string;
  logo: string;
  connected: boolean;
  lastSync: string | null;
}

export default function HealthDevices() {
  const { toast } = useToast();
  const [platforms, setPlatforms] = useState<HealthPlatform[]>([]);
  const [autoSync, setAutoSync] = useState(true);
  
  // Get current user
  const userId = 1;
  
  // Fetch connected health platforms
  const { data: healthIntegrations, isLoading } = useQuery({
    queryKey: ['/api/users/1/health-integrations'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/health-integrations`);
      if (!res.ok) throw new Error('Failed to fetch health integrations');
      return res.json();
    }
  });
  
  useEffect(() => {
    if (healthIntegrations) {
      const platformData: HealthPlatform[] = [
        {
          id: 'apple_health',
          name: 'Apple Health',
          logo: 'https://cdn.iconscout.com/icon/free/png-256/free-apple-health-2-493529.png',
          connected: healthIntegrations.apple_health.connected,
          lastSync: healthIntegrations.apple_health.lastSync
        },
        {
          id: 'garmin',
          name: 'Garmin Connect',
          logo: 'https://cdn.iconscout.com/icon/free/png-256/free-garmin-connect-2749476-2284893.png',
          connected: healthIntegrations.garmin.connected,
          lastSync: healthIntegrations.garmin.lastSync
        },
        {
          id: 'android_health',
          name: 'Google Fit',
          logo: 'https://cdn.iconscout.com/icon/free/png-256/free-google-fit-7-865147.png',
          connected: healthIntegrations.android_health.connected,
          lastSync: healthIntegrations.android_health.lastSync
        },
        {
          id: 'whoop',
          name: 'WHOOP',
          logo: 'https://cdn.iconscout.com/icon/free/png-256/free-whoop-4158956-3459376.png',
          connected: healthIntegrations.whoop.connected,
          lastSync: healthIntegrations.whoop.lastSync
        },
        {
          id: 'oura',
          name: 'Oura Ring',
          logo: 'https://cdn.iconscout.com/icon/free/png-256/free-oura-ring-4661102-3861373.png',
          connected: healthIntegrations.oura.connected,
          lastSync: healthIntegrations.oura.lastSync
        }
      ];
      
      setPlatforms(platformData);
    }
  }, [healthIntegrations]);
  
  // Handle connect/disconnect
  const handleToggleConnect = (platform: HealthPlatform) => {
    if (platform.connected) {
      // Disconnect logic would be here
      toast({
        title: "Disconnected",
        description: `${platform.name} has been disconnected`,
      });
    } else {
      // Connect logic with authentication would be here
      toast({
        title: "Connection initiated",
        description: `You will be redirected to ${platform.name} to authorize the connection`,
      });
    }
  };
  
  // Handle sync data
  const handleSyncData = (platform: HealthPlatform) => {
    toast({
      title: "Syncing data",
      description: `Syncing data from ${platform.name}...`,
    });
    
    // Actual API call would go here
    setTimeout(() => {
      toast({
        title: "Sync complete",
        description: `Successfully synced data from ${platform.name}`,
      });
    }, 2000);
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Health Devices & Services</CardTitle>
          <CardDescription>Connect your health devices and services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-6 text-center">
            <p>Loading integrations...</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Health Devices & Services</CardTitle>
          <CardDescription>Connect your health devices and services to automatically sync your health data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Switch 
                id="auto-sync"
                checked={autoSync}
                onCheckedChange={setAutoSync}
              />
              <Label htmlFor="auto-sync">Automatic daily sync</Label>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast({
              title: "Sync scheduled",
              description: "Data will be synced from all connected platforms"
            })}>
              Sync All Now
            </Button>
          </div>
          
          <div className="space-y-5">
            {platforms.map((platform) => (
              <div key={platform.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-12 rounded-md flex items-center justify-center bg-muted">
                    {/* Use a placeholder icon when logo fails to load */}
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-muted-foreground"
                    >
                      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                      <path d="M3 17a2 2 0 0 1 0-4h16" />
                      <path d="M21 12v5H5a2 2 0 0 0 0 4h14v-4" />
                    </svg>
                  </div>
                  
                  <div>
                    <h3 className="font-medium">{platform.name}</h3>
                    {platform.connected ? (
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100">
                          Connected
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {platform.lastSync ? `Last sync: ${new Date(platform.lastSync).toLocaleDateString()}` : 'Never synced'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Not connected
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  {platform.connected && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleSyncData(platform)}
                    >
                      Sync
                    </Button>
                  )}
                  <Button 
                    size="sm" 
                    variant={platform.connected ? "destructive" : "default"}
                    onClick={() => handleToggleConnect(platform)}
                  >
                    {platform.connected ? 'Disconnect' : 'Connect'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      <PlatformMetrics />
    </div>
  );
}