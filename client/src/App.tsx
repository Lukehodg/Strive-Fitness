import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Workouts from "@/pages/workouts";
import Exercise from "@/pages/exercise";
import Nutrition from "@/pages/nutrition";
import Profile from "@/pages/profile";
import CreateWorkout from "@/pages/create-workout";
import ActiveWorkout from "@/pages/active-workout";
import WeeklyPlan from "@/pages/weekly-plan";
import Health from "@/pages/health";
import Steps from "@/pages/steps";
import Water from "@/pages/water";
import Analytics from "@/pages/analytics";
import SignIn from "@/pages/sign-in";
import AuthPage from "@/pages/auth-page";
import AccountSettings from "@/pages/account-settings";
import PrivacySettings from "@/pages/privacy-settings";
import HelpSupport from "@/pages/help-support";
import Medications from "@/pages/medications";
import BottomNavigation from "@/components/ui/bottom-navigation";
import { ProtectedRoute } from "@/lib/protected-route";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import Logo from "@/components/ui/logo";

function Router() {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useState('/');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  // Handle notification click
  const handleNotificationClick = () => {
    setNotificationsOpen(!notificationsOpen);
  };
  
  // Handle profile click
  const handleProfileClick = () => {
    setLocation('/profile');
  };
  
  // Handle navigation when location changes
  useEffect(() => {
    if (location && location !== '/') {
      window.location.href = location;
    }
  }, [location]);
  
  // Handle click outside to close notifications dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (notificationsOpen && !target.closest('.notifications-container')) {
        setNotificationsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationsOpen]);
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 text-center">
          <div className="flex justify-center mb-4">
            <Logo size="md" />
          </div>
          <h2 className="text-xl font-normal mb-4">Loading...</h2>
          <div className="h-1 w-full bg-gray-200/20 rounded-full mt-1">
            <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full animate-pulse" style={{width: '90%'}}></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background pb-20 font-['Roboto',sans-serif] text-foreground">
      {user && (
        <header className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white p-4 shadow-lg border-b border-indigo-700/50">
          <div className="flex justify-between items-center max-w-lg mx-auto">
            <div 
              onClick={() => setLocation('/')} 
              className="cursor-pointer"
            >
              <Logo size="sm" textClassName="text-white font-semibold" />
            </div>
            <div className="flex items-center space-x-3">
              <div 
                className={`w-8 h-8 rounded-full ${notificationsOpen ? 'bg-blue-600/40' : 'bg-blue-700/30'} flex items-center justify-center hover:bg-blue-600/30 transition-colors cursor-pointer relative`}
                onClick={handleNotificationClick}
              >
                <span className="material-icons text-sm">notifications</span>
                {/* Notification indicator dot */}
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"></span>
              </div>
              <div 
                className="w-8 h-8 rounded-full bg-blue-700/30 flex items-center justify-center hover:bg-blue-600/30 transition-colors cursor-pointer"
                onClick={handleProfileClick}
              >
                <span className="material-icons text-sm">person</span>
              </div>
            </div>
          </div>
          
          {/* Notifications dropdown (conditionally rendered) */}
          {notificationsOpen && (
            <div className="absolute right-4 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2 max-w-xs w-full max-w-lg mx-auto z-50 notifications-container">
              <div className="px-4 py-2 border-b border-gray-700">
                <h3 className="font-semibold text-white">Notifications</h3>
              </div>
              <div className="px-4 py-3 border-b border-gray-700 hover:bg-gray-800 cursor-pointer">
                <p className="text-sm text-white">New workout plan available for you</p>
                <p className="text-xs text-gray-400 mt-1">2 hours ago</p>
              </div>
              <div className="px-4 py-3 border-b border-gray-700 hover:bg-gray-800 cursor-pointer">
                <p className="text-sm text-white">You reached your protein goal today!</p>
                <p className="text-xs text-gray-400 mt-1">5 hours ago</p>
              </div>
              <div className="px-4 py-3 hover:bg-gray-800 cursor-pointer">
                <p className="text-sm text-white">Time to take your medication</p>
                <p className="text-xs text-gray-400 mt-1">8 hours ago</p>
              </div>
            </div>
          )}
        </header>
      )}
      
      <main className="max-w-lg mx-auto">
        <Switch>
          <ProtectedRoute path="/" component={Dashboard} />
          <ProtectedRoute path="/workouts" component={Workouts} />
          <ProtectedRoute path="/workouts/create" component={CreateWorkout} />
          <Route path="/workouts/active/:id">
            {(params) => {
              if (!user) return <Redirect to="/auth" />;
              // Validate that we have a proper numeric ID
              const id = params.id;
              const numericId = parseInt(id, 10);
              
              if (isNaN(numericId)) {
                console.error(`Invalid workout ID: ${id}`);
                return <Redirect to="/workouts" />;
              }
              
              return <ActiveWorkout workoutId={numericId} />;
            }}
          </Route>
          <Route path="/exercise/:id">
            {(params) => {
              if (!user) return <Redirect to="/auth" />;
              const id = params.id;
              const numericId = parseInt(id, 10);
              
              if (isNaN(numericId)) {
                console.error(`Invalid exercise ID: ${id}`);
                return <Redirect to="/workouts" />;
              }
              
              return <Exercise exerciseId={numericId} />;
            }}
          </Route>
          <ProtectedRoute path="/nutrition" component={Nutrition} />
          <ProtectedRoute path="/health" component={Health} />
          <ProtectedRoute path="/profile" component={Profile} />
          <ProtectedRoute path="/steps" component={Steps} />
          <ProtectedRoute path="/water" component={Water} />
          <ProtectedRoute path="/analytics" component={Analytics} />
          <ProtectedRoute path="/medications" component={Medications} />
          <ProtectedRoute path="/weekly-plan" component={WeeklyPlan} />
          <ProtectedRoute path="/account-settings" component={AccountSettings} />
          <ProtectedRoute path="/privacy-settings" component={PrivacySettings} />
          <ProtectedRoute path="/help-support" component={HelpSupport} />
          <Route path="/auth" component={AuthPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      
      {user && <BottomNavigation />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;