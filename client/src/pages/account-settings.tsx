import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, UserCog, Save, Camera, Mail, Phone, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';

const AccountSettings = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    twoFactorEnabled: false,
    emailNotifications: true,
    marketingEmails: false
  });
  
  // Fetch user data
  const { data: userData, isLoading } = useQuery({
    queryKey: ['/api/user/1'],
    staleTime: 60000
  });
  
  // Update form data when user data is loaded
  useEffect(() => {
    if (userData) {
      // Type assertion for userData to include our expected properties
      const user = userData as {
        displayName?: string;
        email?: string;
        phone?: string;
        twoFactorEnabled?: boolean;
        emailNotifications?: boolean;
        marketingEmails?: boolean;
      };
      
      setFormData({
        displayName: user.displayName || '',
        email: user.email || 'user@example.com',
        phone: user.phone || '(555) 123-4567',
        twoFactorEnabled: user.twoFactorEnabled || false,
        emailNotifications: user.emailNotifications !== false,
        marketingEmails: user.marketingEmails || false
      });
    }
  }, [userData]);
  
  const handleSaveChanges = () => {
    toast({
      title: 'Changes Saved',
      description: 'Your account settings have been updated successfully.',
    });
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSwitchChange = (name: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  const handleProfilePhotoUpload = () => {
    toast({
      title: 'Feature Coming Soon',
      description: 'Profile photo upload will be available in a future update.',
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
          <UserCog className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Account Settings</h1>
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details and profile photo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src="" alt="Profile Photo" />
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {userData && 'displayName' in userData 
                  ? (userData as {displayName: string}).displayName.substring(0, 2).toUpperCase() 
                  : 'JD'
                }
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" onClick={handleProfilePhotoUpload} className="flex gap-2">
              <Camera className="h-4 w-4" />
              <span>Change Photo</span>
            </Button>
          </div>
          
          <div>
            <Label htmlFor="displayName">Full Name</Label>
            <Input
              id="displayName"
              name="displayName"
              value={formData.displayName}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Manage your email and phone number</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Email Address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              Phone Number
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleInputChange}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Manage your account security settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <Label>Two-Factor Authentication</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account
              </p>
            </div>
            <Switch
              checked={formData.twoFactorEnabled}
              onCheckedChange={(checked) => handleSwitchChange('twoFactorEnabled', checked)}
            />
          </div>
          
          <Separator />
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive activity and health updates via email
              </p>
            </div>
            <Switch
              checked={formData.emailNotifications}
              onCheckedChange={(checked) => handleSwitchChange('emailNotifications', checked)}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Marketing Emails</Label>
              <p className="text-sm text-muted-foreground">
                Receive promotional offers and newsletters
              </p>
            </div>
            <Switch
              checked={formData.marketingEmails}
              onCheckedChange={(checked) => handleSwitchChange('marketingEmails', checked)}
            />
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-center mt-6">
        <Button 
          onClick={handleSaveChanges}
          className="flex items-center gap-2 w-full max-w-xs"
        >
          <Save className="h-4 w-4" />
          <span>Save Changes</span>
        </Button>
      </div>
    </div>
  );
};

export default AccountSettings;