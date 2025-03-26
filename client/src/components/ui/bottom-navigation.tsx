import React from 'react';
import { useLocation } from 'wouter';
import { DashboardIcon, WorkoutIcon, ProgressIcon, NutritionIcon, ProfileIcon } from '@/lib/icons';

const BottomNavigation = () => {
  const [location, setLocation] = useLocation();

  const isActive = (path: string) => {
    if (path === '/' && location === '/') return true;
    if (path !== '/' && location.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#222222] shadow-lg border-t border-gray-800 flex justify-around py-2 px-4 z-10 max-w-lg mx-auto">
      <button 
        onClick={() => setLocation('/')}
        className={`flex flex-col items-center justify-center w-1/5 py-2 ${isActive('/') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-icons">dashboard</span>
        <span className="text-xs mt-1">Home</span>
      </button>
      
      <button 
        onClick={() => setLocation('/workouts')}
        className={`flex flex-col items-center justify-center w-1/5 py-2 ${isActive('/workouts') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-icons">fitness_center</span>
        <span className="text-xs mt-1">Workouts</span>
      </button>
      
      <button
        onClick={() => setLocation('/exercise/1')}
        className={`flex flex-col items-center justify-center w-1/5 py-2 ${isActive('/exercise') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-icons">analytics</span>
        <span className="text-xs mt-1">Progress</span>
      </button>
      
      <button
        onClick={() => setLocation('/nutrition')}
        className={`flex flex-col items-center justify-center w-1/5 py-2 ${isActive('/nutrition') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-icons">restaurant</span>
        <span className="text-xs mt-1">Nutrition</span>
      </button>
      
      <button
        onClick={() => setLocation('/profile')}
        className={`flex flex-col items-center justify-center w-1/5 py-2 ${isActive('/profile') ? 'text-primary' : 'text-gray-400'}`}
      >
        <span className="material-icons">person</span>
        <span className="text-xs mt-1">Profile</span>
      </button>
    </nav>
  );
};

export default BottomNavigation;
