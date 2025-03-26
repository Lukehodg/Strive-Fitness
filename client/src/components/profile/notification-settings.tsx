import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Bell, 
  MessageSquare, 
  Calendar, 
  Trophy, 
  ActivitySquare, 
  PieChart, 
  Pill,
  Clock,
  Clock4,
  Info
} from 'lucide-react';

interface NotificationSetting {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon: React.ReactNode;
  category: 'app' | 'email' | 'sms';
}

const NotificationSettings = () => {
  const { toast } = useToast();
  
  // Define initial notification settings
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    // App Notifications
    {
      id: 'workout_reminders',
      name: 'Workout Reminders',
      description: 'Receive reminders about scheduled workouts',
      enabled: true,
      icon: <ActivitySquare className="h-5 w-5" />,
      category: 'app'
    },
    {
      id: 'achievement_alerts',
      name: 'Achievement Alerts',
      description: 'Get notified when you earn achievements or reach goals',
      enabled: true,
      icon: <Trophy className="h-5 w-5" />,
      category: 'app'
    },
    {
      id: 'nutrition_reminders',
      name: 'Nutrition Reminders',
      description: 'Receive reminders to log your meals and water intake',
      enabled: false,
      icon: <PieChart className="h-5 w-5" />,
      category: 'app'
    },
    {
      id: 'medication_reminders',
      name: 'Medication Reminders',
      description: 'Get reminded when to take your medications',
      enabled: true,
      icon: <Pill className="h-5 w-5" />,
      category: 'app'
    },
    {
      id: 'supplement_reminders',
      name: 'Supplement Reminders',
      description: 'Receive reminders for your supplement schedule',
      enabled: true,
      icon: <Clock className="h-5 w-5" />,
      category: 'app'
    },
    
    // Email Notifications
    {
      id: 'weekly_summary',
      name: 'Weekly Summary',
      description: 'Receive a summary of your weekly activity and progress',
      enabled: true,
      icon: <Calendar className="h-5 w-5" />,
      category: 'email'
    },
    {
      id: 'new_features',
      name: 'New Features',
      description: 'Learn about new features and improvements',
      enabled: true,
      icon: <Bell className="h-5 w-5" />,
      category: 'email'
    },
    {
      id: 'medication_refill',
      name: 'Medication Refill Reminders',
      description: 'Get notified when your medications need to be refilled',
      enabled: true,
      icon: <Pill className="h-5 w-5" />,
      category: 'email'
    },
    
    // SMS Notifications
    {
      id: 'sms_reminders',
      name: 'SMS Workout Reminders',
      description: 'Get SMS reminders for your scheduled workouts',
      enabled: false,
      icon: <MessageSquare className="h-5 w-5" />,
      category: 'sms'
    },
    {
      id: 'sms_achievements',
      name: 'SMS Achievement Alerts',
      description: 'Get SMS alerts when you reach significant milestones',
      enabled: false,
      icon: <Trophy className="h-5 w-5" />,
      category: 'sms'
    },
    {
      id: 'sms_medication',
      name: 'SMS Medication Reminders',
      description: 'Receive SMS alerts for medication and supplement times',
      enabled: false,
      icon: <Pill className="h-5 w-5" />,
      category: 'sms'
    }
  ]);
  
  // Function to toggle notification setting
  const toggleNotification = (id: string) => {
    setNotifications(notifications.map(notification => 
      notification.id === id 
        ? { ...notification, enabled: !notification.enabled } 
        : notification
    ));
    
    const notification = notifications.find(n => n.id === id);
    
    toast({
      title: notification?.enabled ? "Notification Disabled" : "Notification Enabled",
      description: `${notification?.name} notifications have been ${notification?.enabled ? 'disabled' : 'enabled'}.`,
    });
  };
  
  // Function to save notification settings
  const saveSettings = () => {
    // In a real app, this would send the settings to the server
    toast({
      title: "Settings Saved",
      description: "Your notification preferences have been updated.",
    });
  };
  
  // Function to simulate medication reminder
  const testMedicationReminder = () => {
    if (!notifications.find(n => n.id === 'medication_reminders')?.enabled) {
      toast({
        title: "Notifications Disabled",
        description: "Please enable medication reminders first.",
        variant: "destructive"
      });
      return;
    }
    
    // Simulate medication reminder
    setTimeout(() => {
      toast({
        title: "Medication Reminder",
        description: "Time to take your Vitamin D supplement (2000 IU)",
      });
    }, 1500);
    
    toast({
      title: "Test Started",
      description: "You will receive a medication reminder in a moment...",
    });
  };
  
  // Function to simulate supplement reminder
  const testSupplementReminder = () => {
    if (!notifications.find(n => n.id === 'supplement_reminders')?.enabled) {
      toast({
        title: "Notifications Disabled",
        description: "Please enable supplement reminders first.",
        variant: "destructive"
      });
      return;
    }
    
    // Simulate supplement reminder
    setTimeout(() => {
      toast({
        title: "Supplement Reminder",
        description: "Time to take your Protein shake (30g)",
      });
    }, 1500);
    
    toast({
      title: "Test Started",
      description: "You will receive a supplement reminder in a moment...",
    });
  };
  
  // Filter notifications by category
  const appNotifications = notifications.filter(n => n.category === 'app');
  const emailNotifications = notifications.filter(n => n.category === 'email');
  const smsNotifications = notifications.filter(n => n.category === 'sms');
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Notification Settings</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="app" className="w-full">
          <div className="px-4">
            <TabsList className="w-full mb-4 grid grid-cols-3">
              <TabsTrigger value="app">App</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="sms">SMS</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="app" className="mt-0">
            <div className="divide-y">
              {appNotifications.map((notification) => (
                <div key={notification.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                      {notification.icon}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{notification.name}</span>
                      <span className="text-sm text-muted-foreground">{notification.description}</span>
                    </div>
                  </div>
                  <Switch 
                    checked={notification.enabled}
                    onCheckedChange={() => toggleNotification(notification.id)}
                  />
                </div>
              ))}
              
              {/* Test buttons for medication notifications */}
              <div className="p-4 space-y-4">
                <div className="flex flex-col space-y-2">
                  <h3 className="text-sm font-medium">Test Notifications</h3>
                  <p className="text-xs text-muted-foreground">Try out how notifications will appear on your device</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={testMedicationReminder}
                    className="flex items-center gap-2"
                  >
                    <Pill className="h-4 w-4" />
                    <span>Test Medication Reminder</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={testSupplementReminder}
                    className="flex items-center gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    <span>Test Supplement Reminder</span>
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="email" className="mt-0">
            <div className="divide-y">
              {emailNotifications.map((notification) => (
                <div key={notification.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                      {notification.icon}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{notification.name}</span>
                      <span className="text-sm text-muted-foreground">{notification.description}</span>
                    </div>
                  </div>
                  <Switch 
                    checked={notification.enabled}
                    onCheckedChange={() => toggleNotification(notification.id)}
                  />
                </div>
              ))}
              
              <div className="p-4">
                <Label className="text-sm text-muted-foreground mb-2 block">
                  Email notifications will be sent to: james.wilson@example.com
                </Label>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="sms" className="mt-0">
            <div className="divide-y">
              {smsNotifications.map((notification) => (
                <div key={notification.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                      {notification.icon}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium">{notification.name}</span>
                      <span className="text-sm text-muted-foreground">{notification.description}</span>
                    </div>
                  </div>
                  <Switch 
                    checked={notification.enabled}
                    onCheckedChange={() => toggleNotification(notification.id)}
                  />
                </div>
              ))}
              
              <div className="p-4">
                <Label className="text-sm text-muted-foreground mb-2 block">
                  SMS notifications will be sent to: (555) 123-4567
                </Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="p-4 flex justify-end">
          <Button onClick={saveSettings}>Save Preferences</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;