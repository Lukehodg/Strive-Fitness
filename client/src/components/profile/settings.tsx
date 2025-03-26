import React from 'react';
import { 
  ChevronRight, 
  Bell, 
  Dumbbell, 
  Utensils, 
  UserCog, 
  HelpCircle, 
  ActivitySquare, 
  Droplets, 
  FootprintsIcon, 
  PillIcon, 
  ShieldAlert 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SettingItem {
  icon: string;
  label: string;
  action: () => void;
}

interface SettingsProps {
  settings: SettingItem[];
}

// Map material icons to Lucide icons
const iconMap: Record<string, React.ReactNode> = {
  'notifications': <Bell className="h-5 w-5" />,
  'fitness_center': <Dumbbell className="h-5 w-5" />,
  'restaurant': <Utensils className="h-5 w-5" />,
  'account_circle': <UserCog className="h-5 w-5" />,
  'help': <HelpCircle className="h-5 w-5" />,
  'health_and_safety': <PillIcon className="h-5 w-5" />,
  'monitoring_health': <ActivitySquare className="h-5 w-5" />,
  'water_drop': <Droplets className="h-5 w-5" />,
  'directions_walk': <FootprintsIcon className="h-5 w-5" />,
  'medication': <PillIcon className="h-5 w-5" />,
  'lock': <ShieldAlert className="h-5 w-5" />
};

const Settings: React.FC<SettingsProps> = ({ settings }) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Settings</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {settings.map((setting, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-primary/5 transition-colors"
              onClick={setting.action}
            >
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                  {iconMap[setting.icon] || <span className="material-icons text-sm">{setting.icon}</span>}
                </div>
                <span className="font-medium">{setting.label}</span>
              </div>
              <ChevronRight className="text-muted-foreground h-5 w-5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default Settings;
