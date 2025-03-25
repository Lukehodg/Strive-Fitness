import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Workouts from "@/pages/workouts";
import Exercise from "@/pages/exercise";
import Nutrition from "@/pages/nutrition";
import Profile from "@/pages/profile";
import BottomNavigation from "@/components/ui/bottom-navigation";
import { useEffect, useState } from "react";

function Router() {
  const [_, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Fetch the user on load
  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch('/api/user/1');
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchUser();
  }, []);
  
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Loading FitForge...</h2>
          <div className="h-1 w-full bg-gray-200 rounded-full mt-1">
            <div className="h-1 bg-primary rounded-full animate-pulse" style={{width: '90%'}}></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-[#F5F5F5] pb-20 font-['Roboto',sans-serif] text-[#333333]">
      <header className="bg-primary text-white p-4 shadow-md">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <h1 className="text-xl font-bold font-['Inter',sans-serif]">FitForge</h1>
          <div className="flex items-center space-x-2">
            <span className="material-icons">notifications</span>
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <span className="material-icons text-sm">person</span>
            </div>
          </div>
        </div>
      </header>
      
      <main className="max-w-lg mx-auto">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/workouts" component={Workouts} />
          <Route path="/exercise/:id">
            {(params) => <Exercise exerciseId={parseInt(params.id, 10)} />}
          </Route>
          <Route path="/nutrition" component={Nutrition} />
          <Route path="/profile" component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </main>
      
      <BottomNavigation />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
