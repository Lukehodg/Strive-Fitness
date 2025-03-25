import React from 'react';
import { useLocation } from 'wouter';
import { ChevronRightIcon } from '@/lib/icons';

interface Activity {
  id: number;
  type: 'workout' | 'nutrition' | 'medication';
  title: string;
  description: string;
}

interface TodayActivitiesProps {
  activities: Activity[];
  onViewAll: () => void;
}

const TodayActivities: React.FC<TodayActivitiesProps> = ({ activities, onViewAll }) => {
  const [_, setLocation] = useLocation();

  const getIconClass = (type: string) => {
    switch (type) {
      case 'workout':
        return 'bg-primary/10 text-primary';
      case 'nutrition':
        return 'bg-secondary/10 text-secondary';
      case 'medication':
        return 'bg-accent/10 text-accent';
      default:
        return 'bg-gray-100 text-gray-500';
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
    if (activity.type === 'workout') {
      setLocation('/workouts');
    } else if (activity.type === 'nutrition') {
      setLocation('/nutrition');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-['Inter',sans-serif] text-lg font-semibold">Today's Activities</h3>
        <span className="text-primary text-sm cursor-pointer" onClick={onViewAll}>View All</span>
      </div>
      
      {activities.map((activity) => (
        <div 
          key={activity.id}
          className="bg-[#F5F5F5] rounded-lg p-3 mb-3 last:mb-0 flex items-center justify-between cursor-pointer"
          onClick={() => handleActivityClick(activity)}
        >
          <div className="flex items-center">
            <div className={`${getIconClass(activity.type)} rounded-lg p-2 mr-3`}>
              <span className="material-icons">{getIcon(activity.type)}</span>
            </div>
            <div>
              <h4 className="font-medium">{activity.title}</h4>
              <p className="text-xs text-gray-500">{activity.description}</p>
            </div>
          </div>
          <ChevronRightIcon className="text-gray-400 w-5 h-5" />
        </div>
      ))}
    </div>
  );
};

export default TodayActivities;
