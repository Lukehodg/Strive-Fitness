import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../lib/queryClient';
import { 
  ChevronLeft, 
  ShieldAlert, 
  Save, 
  Eye, 
  EyeOff, 
  Database, 
  Share2, 
  Trash2, 
  Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const PrivacySettings = () => {
  const { toast } = useToast();
  const [privacySettings, setPrivacySettings] = useState({
    profileVisibility: 'friends',
    activitySharing: true,
    dataCollection: true,
    locationTracking: false,
    analyticsSharing: true
  });
  
  // Fetch user data
  const { data: userData, isLoading } = useQuery({
    queryKey: ['/api/user/1'],
    queryFn: async () => {
      const response = await fetch('/api/user/1');
      return response.json();
    }
  });
  
  // Update user settings on the server
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: any) => {
      const res = await apiRequest('PATCH', '/api/user/1', { privacySettings: settings });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/1'] });
      toast({
        title: 'Privacy Settings Saved',
        description: 'Your privacy settings have been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error Saving Settings',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  // Load user data when available
  useEffect(() => {
    if (userData && userData.privacySettings) {
      setPrivacySettings(userData.privacySettings);
    }
  }, [userData]);
  
  const handleSaveChanges = () => {
    updateSettingsMutation.mutate(privacySettings);
  };
  
  const handleSwitchChange = (name: string, checked: boolean) => {
    setPrivacySettings(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  const handleRadioChange = (value: string) => {
    setPrivacySettings(prev => ({
      ...prev,
      profileVisibility: value
    }));
  };
  
  const handleExportData = () => {
    toast({
      title: 'Exporting Data',
      description: 'Your data export has started. You will receive an email when it is ready.',
    });
  };
  
  const handleDeleteAccount = () => {
    toast({
      title: 'Account Deletion Requested',
      description: 'Your account deletion request has been submitted. You will receive an email with further instructions.',
      variant: 'destructive'
    });
  };
  
  return (
    <div className="p-4 space-y-6 pb-24 max-w-2xl mx-auto">
      <div className="flex items-center mb-6">
        <Link href="/profile">
          <Button variant="ghost" size="sm" className="mr-2 h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Privacy Settings</h1>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Profile Visibility</CardTitle>
          <CardDescription>Control who can see your profile and activity information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Who can see your profile?</Label>
            <RadioGroup
              value={privacySettings.profileVisibility}
              onValueChange={handleRadioChange}
              className="flex flex-col space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="public" id="public" />
                <Label htmlFor="public" className="flex items-center gap-2 cursor-pointer">
                  <Eye className="h-4 w-4 text-primary" />
                  <span>Everyone (Public)</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="friends" id="friends" />
                <Label htmlFor="friends" className="flex items-center gap-2 cursor-pointer">
                  <Share2 className="h-4 w-4 text-primary" />
                  <span>Friends Only</span>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="private" />
                <Label htmlFor="private" className="flex items-center gap-2 cursor-pointer">
                  <EyeOff className="h-4 w-4 text-primary" />
                  <span>Only Me (Private)</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Activity & Data Sharing</CardTitle>
          <CardDescription>Manage how your activities and data are shared</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" />
                Activity Sharing
              </Label>
              <p className="text-sm text-muted-foreground">
                Allow your workout activities to be shared with friends
              </p>
            </div>
            <Switch
              checked={privacySettings.activitySharing}
              onCheckedChange={(checked) => handleSwitchChange('activitySharing', checked)}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                Data Collection
              </Label>
              <p className="text-sm text-muted-foreground">
                Allow the app to collect anonymized usage data to improve features
              </p>
            </div>
            <Switch
              checked={privacySettings.dataCollection}
              onCheckedChange={(checked) => handleSwitchChange('dataCollection', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Location Tracking</Label>
              <p className="text-sm text-muted-foreground">
                Allow the app to track your location for activity mapping
              </p>
            </div>
            <Switch
              checked={privacySettings.locationTracking}
              onCheckedChange={(checked) => handleSwitchChange('locationTracking', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Analytics Sharing</Label>
              <p className="text-sm text-muted-foreground">
                Share anonymous analytics data to help improve the app
              </p>
            </div>
            <Switch
              checked={privacySettings.analyticsSharing}
              onCheckedChange={(checked) => handleSwitchChange('analyticsSharing', checked)}
            />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
          <CardDescription>Export or delete your personal data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              onClick={handleExportData}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              <span>Export Your Data</span>
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Account</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your
                    account and remove all your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteAccount}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-center mt-6">
        <Button 
          onClick={handleSaveChanges}
          className="flex items-center gap-2 w-full max-w-xs"
          disabled={updateSettingsMutation.isPending || isLoading}
        >
          {updateSettingsMutation.isPending ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Changes</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default PrivacySettings;