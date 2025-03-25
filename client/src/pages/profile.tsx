import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

import ProfileHeader from '@/components/profile/profile-header';
import ProfileStats from '@/components/profile/profile-stats';
import Settings from '@/components/profile/settings';

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
      
      <Settings settings={settingsItems} />
    </div>
  );
};

export default Profile;
