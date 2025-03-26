import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import ProfileHeader from '@/components/profile/profile-header';
import ProfileStats from '@/components/profile/profile-stats';
import Settings from '@/components/profile/settings';
import HealthDevices from '@/components/profile/health-devices';

const Profile = () => {
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  
  // Fetch user data
  const { data: userData } = useQuery({
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
  
  useEffect(() => {
    if (userData) {
      setUser(userData);
    }
  }, [userData]);
  
  if (!user) {
    return (
      <div className="p-4 flex items-center justify-center h-[90vh]">
        <p>Loading...</p>
      </div>
    );
  }
  
  // Define settings items
  const settingsItems = [
    {
      icon: 'notifications',
      label: 'Notifications',
      action: () => handleSettingsAction('Notifications')
    },
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
      icon: 'account_circle',
      label: 'Account',
      action: () => handleSettingsAction('Account')
    },
    {
      icon: 'help',
      label: 'Help & Support',
      action: () => handleSettingsAction('Help & Support')
    }
  ];
  
  return (
    <div className="p-4 space-y-6">
      <ProfileHeader 
        name={user.displayName}
        profileType={user.profileType}
      />
      
      <ProfileStats 
        height={user.height}
        weight={user.weight}
        bmi={calculateBMI(user.height, user.weight)}
        bodyFat={user.bodyFat}
      />
      
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="w-full grid grid-cols-2 mb-6">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Settings</span>
          </TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 13V12M12 13V10M16 13V8M8 21L12 17L16 21M3 4H21M4 4H20V16C20 16.5523 19.5523 17 19 17H5C4.44772 17 4 16.5523 4 16V4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Health Devices</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="settings">
          <Settings settings={settingsItems} />
        </TabsContent>
        
        <TabsContent value="devices">
          <HealthDevices />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Profile;
