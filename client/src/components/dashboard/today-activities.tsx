import React from 'react';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { ChevronRightIcon } from '@/lib/icons';

interface Activity {
  id: number;
  type: 'workout' | 'nutrition' | 'medication';
  title: string;
  description: string;
  date?: string;
}

interface TodayActivitiesProps {
  activities: Activity[];
  onViewAll: () => void;
  selectedDate: Date;
}

const TodayActivities: React.FC<TodayActivitiesProps> = ({ activities, onViewAll, selectedDate }) => {
  const [_, setLocation] = useLocation();

  const getIconClass = (type: string) => {
    switch (type) {
      case 'workout':
        return 'bg-primary/20 text-primary';
      case 'nutrition':
        return 'bg-secondary/20 text-secondary';
      case 'medication':
        return 'bg-accent/20 text-accent';
      default:
        return 'bg-gray-800 text-gray-300';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'workout':
        return 'fitness_center';
      case 'nutrition':
        return 'local_dining';
      case 'medication':
        return 'medication';
      default:
        return 'event';
    }
  };

  const handleActivityClick = (activity: Activity) => {
    switch (activity.type) {
      case 'workout':
        setLocation('/workouts');
        break;
      case 'nutrition':
        setLocation('/nutrition');
        break;
      case 'medication':
        // Store the tab in sessionStorage to activate the medications tab when loaded
        sessionStorage.setItem('healthTab', 'medications');
        setLocation('/health');
        break;
      default:
        console.log('Unknown activity type:', activity.type);
    }
  };

  // Filter activities for the selected date
  const isToday = format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const formattedDate = format(selectedDate, 'MMMM d, yyyy');
  
  // In a real app, we would filter by the activity date
  // For demo purposes, we'll show all activities on any selected date
  const filteredActivities = activities;
  
  return (
    <div className="bg-gray-800 rounded-xl shadow-sm p-4 mb-6 border border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold text-white">
          {isToday ? "Today's Activities" : `Activities for ${formattedDate}`}
        </h3>
        <span className="text-primary text-sm cursor-pointer hover:text-primary/80" onClick={onViewAll}>View All</span>
      </div>
      
      {filteredActivities.length > 0 ? (
        filteredActivities.map((activity) => (
          <div 
            key={activity.id}
            className="bg-gray-900 rounded-lg p-3 mb-3 last:mb-0 flex items-center justify-between cursor-pointer hover:bg-gray-800 border border-gray-700 transition-colors"
            onClick={() => handleActivityClick(activity)}
          >
            <div className="flex items-center">
              <div className={`${getIconClass(activity.type)} rounded-lg p-2 mr-3`}>
                <span className="material-icons">{getIcon(activity.type)}</span>
              </div>
              <div>
                <h4 className="font-medium text-white">{activity.title}</h4>
                <p className="text-xs text-gray-400">{activity.description}</p>
              </div>
            </div>
            <ChevronRightIcon className="text-gray-400 w-5 h-5" />
          </div>
        ))
      ) : (
        <div className="bg-gray-900 rounded-lg p-4 text-center text-gray-400">
          No activities scheduled for this date
        </div>
      )}
    </div>
  );
};

export default TodayActivities;
