import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';

interface HealthPlatform {
  id: 'apple_health' | 'garmin' | 'android_health';
  name: string;
  logo: string;
  connected: boolean;
  lastSync: string | null;
}

export default function HealthIntegrations() {
  const [activeDialog, setActiveDialog] = useState<string | null>(null);
  const [syncingPlatform, setSyncingPlatform] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Hardcoded user ID for demo purposes
  const userId = 1;
  
  // Fetch connected health platforms
  const { data: connections, isLoading } = useQuery({
    queryKey: ['/api/users/1/health-integrations'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/health-integrations`);
      if (!res.ok) throw new Error('Failed to fetch health connections');
      return res.json();
    }
  });
  
  // Format the platforms data
  const platforms: HealthPlatform[] = [
    {
      id: 'apple_health',
      name: 'Apple Health',
      logo: '🍎',
      connected: connections?.apple_health?.connected || false,
      lastSync: connections?.apple_health?.last_sync || null
    },
    {
      id: 'garmin',
      name: 'Garmin Connect',
      logo: '⌚',
      connected: connections?.garmin?.connected || false,
      lastSync: connections?.garmin?.last_sync || null
    },
    {
      id: 'android_health',
      name: 'Android Health',
      logo: '🤖',
      connected: connections?.android_health?.connected || false,
      lastSync: connections?.android_health?.last_sync || null
    }
  ];
  
  // Connect to health platform mutation
  const connectMutation = useMutation({
    mutationFn: async ({ platformId, connect }: { platformId: string, connect: boolean }) => {
      if (connect) {
        // For connect, we need authorization data
        return apiRequest(
          'POST',
          '/api/health-integrations/connect',
          {
            userId: userId,
            platform: platformId,
            authData: { authorized: true } // This would be real auth data in production
          }
        );
      } else {
        // For disconnect, we would have a different endpoint in a real app
        // This is simplified for the prototype
        return { success: true, message: "Disconnected successfully" };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/health-integrations'] });
      toast({
        title: "Success",
        description: "Health platform connection updated successfully",
      });
      setActiveDialog(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update connection: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    }
  });
  
  // Sync health data mutation
  const syncMutation = useMutation({
    mutationFn: async (platformId: string) => {
      return apiRequest(
        'GET',
        `/api/users/${userId}/health-integrations/sync?platform=${platformId}`
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/1/health-metrics'] });
      toast({
        title: "Sync Completed",
        description: `Imported ${data.data.imported} health measurements${data.data.skipped > 0 ? `, skipped ${data.data.skipped}` : ''}`,
      });
      setSyncingPlatform(null);
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: `Could not sync health data: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
      setSyncingPlatform(null);
    }
  });
  
  // Handle toggle for connecting/disconnecting platforms
  const handleConnectionToggle = (platformId: string, currentlyConnected: boolean) => {
    // In a real app, this would open OAuth flow or handle disconnection
    // For the prototype, we'll simulate this with dialogs
    setActiveDialog(currentlyConnected ? `disconnect-${platformId}` : `connect-${platformId}`);
  };
  
  // Handle sync request
  const handleSync = (platformId: string) => {
    setSyncingPlatform(platformId);
    syncMutation.mutate(platformId);
  };
  
  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return 'Invalid date';
    }
  };
  
  if (isLoading) {
    return (
      <div className="p-4">
        <p>Loading health integrations...</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Health Services Integration</CardTitle>
          <CardDescription>
            Connect to health services to automatically import your health data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {platforms.map((platform) => (
              <div key={platform.id} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-md flex items-center justify-center bg-primary/10 text-2xl">
                    {platform.logo}
                  </div>
                  <div>
                    <p className="font-medium">{platform.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {platform.connected 
                        ? `Last synced: ${formatDate(platform.lastSync)}`
                        : 'Not connected'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {platform.connected && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={syncingPlatform === platform.id}
                      onClick={() => handleSync(platform.id)}
                    >
                      {syncingPlatform === platform.id ? 'Syncing...' : 'Sync Now'}
                    </Button>
                  )}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`${platform.id}-toggle`}
                      checked={platform.connected}
                      onCheckedChange={() => handleConnectionToggle(platform.id, platform.connected)}
                    />
                    <Label htmlFor={`${platform.id}-toggle`}>
                      {platform.connected ? 'Connected' : 'Connect'}
                    </Label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="border-t pt-6">
          <p className="text-sm text-muted-foreground">
            Your health data will be imported securely and privately. You can disconnect at any time.
          </p>
        </CardFooter>
      </Card>
      
      {/* Connect dialogs */}
      {platforms.map(platform => (
        <Dialog 
          key={`connect-${platform.id}`}
          open={activeDialog === `connect-${platform.id}`} 
          onOpenChange={() => setActiveDialog(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect to {platform.name}</DialogTitle>
              <DialogDescription>
                Allow Strive to access your health data from {platform.name}. 
                Your data is stored securely and never shared with third parties.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm font-medium">This will allow Strive to:</p>
              <ul className="list-disc pl-5 py-2 text-sm text-muted-foreground">
                <li>Read your health metrics and activity data</li>
                <li>Automatically import new measurements</li>
                <li>Track your progress over time</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                You can disconnect at any time and we'll stop importing data.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
              <Button 
                onClick={() => connectMutation.mutate({ platformId: platform.id, connect: true })}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? 'Connecting...' : 'Connect'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
      
      {/* Disconnect dialogs */}
      {platforms.map(platform => (
        <Dialog 
          key={`disconnect-${platform.id}`}
          open={activeDialog === `disconnect-${platform.id}`} 
          onOpenChange={() => setActiveDialog(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Disconnect from {platform.name}?</DialogTitle>
              <DialogDescription>
                Your existing data will remain in Strive, but no new data will be imported.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button>
              <Button 
                variant="destructive"
                onClick={() => connectMutation.mutate({ platformId: platform.id, connect: false })}
                disabled={connectMutation.isPending}
              >
                {connectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}