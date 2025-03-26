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
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a2e] shadow-lg border-t border-indigo-900/30 flex justify-around py-2 px-4 z-10 max-w-lg mx-auto">
      <button 
        onClick={() => setLocation('/')}
        className={`flex flex-col items-center justify-center w-1/5 py-1.5 transition-colors duration-200 ease-in-out ${isActive('/') ? 'text-primary font-medium' : 'text-gray-400 hover:text-gray-300'}`}
      >
        <span className={`material-icons ${isActive('/') ? 'bg-indigo-500/10 p-1 rounded-full' : ''}`}>dashboard</span>
        <span className="text-xs mt-1">Home</span>
      </button>
      
      <button 
        onClick={() => setLocation('/workouts')}
        className={`flex flex-col items-center justify-center w-1/5 py-1.5 transition-colors duration-200 ease-in-out ${isActive('/workouts') ? 'text-primary font-medium' : 'text-gray-400 hover:text-gray-300'}`}
      >
        <span className={`material-icons ${isActive('/workouts') ? 'bg-indigo-500/10 p-1 rounded-full' : ''}`}>fitness_center</span>
        <span className="text-xs mt-1">Workouts</span>
      </button>
      
      <button
        onClick={() => setLocation('/health')}
        className={`flex flex-col items-center justify-center w-1/5 py-1.5 transition-colors duration-200 ease-in-out ${isActive('/health') ? 'text-primary font-medium' : 'text-gray-400 hover:text-gray-300'}`}
      >
        <span className={`material-icons ${isActive('/health') ? 'bg-indigo-500/10 p-1 rounded-full' : ''}`}>favorite</span>
        <span className="text-xs mt-1">Health</span>
      </button>
      
      <button
        onClick={() => setLocation('/nutrition')}
        className={`flex flex-col items-center justify-center w-1/5 py-1.5 transition-colors duration-200 ease-in-out ${isActive('/nutrition') ? 'text-primary font-medium' : 'text-gray-400 hover:text-gray-300'}`}
      >
        <span className={`material-icons ${isActive('/nutrition') ? 'bg-indigo-500/10 p-1 rounded-full' : ''}`}>restaurant</span>
        <span className="text-xs mt-1">Nutrition</span>
      </button>
      
      <button
        onClick={() => setLocation('/profile')}
        className={`flex flex-col items-center justify-center w-1/5 py-1.5 transition-colors duration-200 ease-in-out ${isActive('/profile') ? 'text-primary font-medium' : 'text-gray-400 hover:text-gray-300'}`}
      >
        <span className={`material-icons ${isActive('/profile') ? 'bg-indigo-500/10 p-1 rounded-full' : ''}`}>person</span>
        <span className="text-xs mt-1">Profile</span>
      </button>
    </nav>
  );
};

export default BottomNavigation;
