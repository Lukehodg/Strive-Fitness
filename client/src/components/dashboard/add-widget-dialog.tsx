import React, { useState } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Widget } from './widget-system';
import { Activity } from 'lucide-react';
import { 
  DiningIcon, 
  WorkoutIcon, 
  NotificationIcon,
  ProgressIcon
} from '@/lib/icons';

interface AddWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddWidget: (widget: Omit<Widget, 'id'>) => void;
  availableData: {
    progress: any[];
    nutrition: any[];
    workouts: any[];
    activities: any[];
  };
}

const AddWidgetDialog: React.FC<AddWidgetDialogProps> = ({
  open,
  onOpenChange,
  onAddWidget,
  availableData
}) => {
  const [selectedTab, setSelectedTab] = useState('progress');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const handleAddWidget = () => {
    if (!selectedItem) return;

    let widgetData: Omit<Widget, 'id'>;

    switch (selectedTab) {
      case 'progress':
        widgetData = {
          type: 'progress',
          title: selectedItem.label,
          data: selectedItem,
          route: selectedItem.route // Preserve route if it exists
        };
        break;
      case 'nutrition':
        widgetData = {
          type: 'nutrition',
          title: 'Nutrition Summary',
          data: selectedItem,
          route: selectedItem.route // Preserve route if it exists
        };
        break;
      case 'workouts':
        widgetData = {
          type: 'workout',
          title: 'Next Workout',
          data: selectedItem,
          route: selectedItem.route // Preserve route if it exists
        };
        break;
      case 'activities':
        widgetData = {
          type: 'activity',
          title: 'Activity',
          data: selectedItem,
          route: selectedItem.route // Preserve route if it exists
        };
        break;
      default:
        return;
    }

    onAddWidget(widgetData);
    onOpenChange(false);
  };

  const renderProgressItems = () => {
    return availableData.progress.map((item, index) => (
      <div 
        key={index}
        className={`dark-card p-3 cursor-pointer ${selectedItem === item ? 'border-primary' : 'border-gray-700'}`}
        onClick={() => setSelectedItem(item)}
      >
        <div className="flex items-center mb-2">
          <ProgressIcon className="w-5 h-5 mr-2 text-primary" />
          <span className="text-white">{item.label}</span>
        </div>
        <div className="text-sm text-gray-400">
          Current: {item.value} / {item.total}
        </div>
      </div>
    ));
  };

  const renderNutritionItems = () => {
    return availableData.nutrition.map((item, index) => (
      <div 
        key={index}
        className={`dark-card p-3 cursor-pointer ${selectedItem === item ? 'border-primary' : 'border-gray-700'}`}
        onClick={() => setSelectedItem(item)}
      >
        <div className="flex items-center mb-2">
          <DiningIcon className="w-5 h-5 mr-2 text-[#FF5722]" />
          <span className="text-white">Calories</span>
        </div>
        <div className="text-sm text-gray-400">
          Remaining: {item.remaining}
        </div>
      </div>
    ));
  };

  const renderWorkoutItems = () => {
    return availableData.workouts.map((item, index) => (
      <div 
        key={index}
        className={`dark-card p-3 cursor-pointer ${selectedItem === item ? 'border-primary' : 'border-gray-700'}`}
        onClick={() => setSelectedItem(item)}
      >
        <div className="flex items-center mb-2">
          <WorkoutIcon className="w-5 h-5 mr-2 text-[#3F51B5]" />
          <span className="text-white">{item.name}</span>
        </div>
        <div className="text-sm text-gray-400">
          {item.exerciseCount} exercises · {item.duration} min
        </div>
      </div>
    ));
  };

  const renderActivityItems = () => {
    return availableData.activities.map((item, index) => (
      <div 
        key={index}
        className={`dark-card p-3 cursor-pointer ${selectedItem === item ? 'border-primary' : 'border-gray-700'}`}
        onClick={() => setSelectedItem(item)}
      >
        <div className="flex items-center mb-2">
          <Activity className="w-5 h-5 mr-2 text-accent" />
          <span className="text-white">{item.title}</span>
        </div>
        <div className="text-sm text-gray-400">
          {item.description}
        </div>
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Widget</DialogTitle>
          <DialogDescription>
            Select a widget to add to your dashboard
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="progress" value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
            <TabsTrigger value="workouts">Workouts</TabsTrigger>
            <TabsTrigger value="activities">Activities</TabsTrigger>
          </TabsList>
          
          <TabsContent value="progress" className="space-y-3 max-h-[300px] overflow-y-auto">
            {renderProgressItems()}
          </TabsContent>
          
          <TabsContent value="nutrition" className="space-y-3 max-h-[300px] overflow-y-auto">
            {renderNutritionItems()}
          </TabsContent>
          
          <TabsContent value="workouts" className="space-y-3 max-h-[300px] overflow-y-auto">
            {renderWorkoutItems()}
          </TabsContent>
          
          <TabsContent value="activities" className="space-y-3 max-h-[300px] overflow-y-auto">
            {renderActivityItems()}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddWidget} disabled={!selectedItem}>
            Add Widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddWidgetDialog;