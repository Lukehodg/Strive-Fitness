import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bell,
  Settings as SettingsIcon, 
  LogOut, 
  Network,
  Loader2
} from 'lucide-react';

import ProfileHeader from '@/components/profile/profile-header';
import ProfileStats from '@/components/profile/profile-stats';
import Settings from '@/components/profile/settings';
import Integrations from '@/components/profile/integrations';
import NotificationSettings from '@/components/profile/notification-settings';
import SubscriptionManagement from '@/components/profile/subscription-management';

const Profile = () => {
  const { toast } = useToast();
  const { signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  
  // Fetch user data
  const { data: userData, isLoading } = useQuery({
    queryKey: ['/api/user/1'],
    staleTime: 60000, // 1 minute
  });
  
  // Calculate BMI
  const calculateBMI = (height: number, weight: number) => {
    if (!height || !weight) return 0;
    // BMI = weight(kg) / (height(m))²
    const heightInMeters = height / 100;
    return weight / (heightInMeters * heightInMeters);
  };
  
  // Handle settings actions
  const handleSettingsAction = (setting: string) => {
    toast({
      title: setting,
      description: "This feature is coming soon!",
    });
  };
  
  // Handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      setLocation('/auth');
      toast({
        title: "Signed out successfully",
        description: "You have been signed out of your account",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error signing out",
        description: "There was a problem signing you out. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);
  
  // Define settings items
  const settingsItems = [
    {
      icon: 'fitness_center',
      label: 'Workout Settings',
      action: () => handleSettingsAction('Workout Settings')
    },
    {
      icon: 'restaurant',
      label: 'Nutrition Settings',
      action: () => handleSettingsAction('Nutrition Settings')
    },
    {
      icon: 'health_and_safety',
      label: 'Health Settings',
      action: () => handleSettingsAction('Health Settings')
    },
    {
      icon: 'account_circle',
      label: 'Account',
      action: () => handleSettingsAction('Account')
    },
    {
      icon: 'lock',
      label: 'Privacy Settings',
      action: () => handleSettingsAction('Privacy Settings')
    },
    {
      icon: 'help',
      label: 'Help & Support',
      action: () => handleSettingsAction('Help & Support')
    }
  ];
  
  if (isLoading) {
    return (
      <div className="p-4 space-y-6">
        <div className="flex items-center space-x-4 mb-6">
          <Skeleton className="w-20 h-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!user) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-[80vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading your profile...</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6 pb-24 max-w-3xl mx-auto">
      <div className="flex flex-col">
        <ProfileHeader 
          name={user.displayName}
          profileType={user.profileType}
        />
      </div>
      
      <ProfileStats 
        height={user.height}
        weight={user.weight}
        bmi={calculateBMI(user.height, user.weight)}
        bodyFat={user.bodyFat}
      />
      
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            <span>Settings</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Network className="h-4 w-4" />
            <span>Integrations</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="settings" className="mt-0">
          <Settings settings={settingsItems} />
        </TabsContent>
        
        <TabsContent value="notifications" className="mt-0">
          <NotificationSettings />
        </TabsContent>
        
        <TabsContent value="integrations" className="mt-0">
          <Integrations />
        </TabsContent>
      </Tabs>
      
      <Separator className="my-6" />
      
      {/* Sign Out Button - moved to bottom */}
      <div className="flex justify-center">
        <Button 
          variant="destructive" 
          onClick={handleSignOut}
          className="flex items-center gap-2 w-full max-w-xs"
          size="lg"
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </Button>
      </div>
      
      <div className="text-center mt-6">
        <p className="text-sm text-muted-foreground">Strive Fitness v1.0.0</p>
        <p className="text-xs text-muted-foreground mt-1">© {new Date().getFullYear()} Strive. All rights reserved.</p>
      </div>
    </div>
  );
};

export default Profile;
