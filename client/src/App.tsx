import { Switch, Route, Redirect } from "wouter";
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
import Health from "@/pages/health";
import SignIn from "@/pages/sign-in";
import BottomNavigation from "@/components/ui/bottom-navigation";
import { ProtectedRoute } from "@/lib/protected-route";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";

function Router() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-full max-w-md p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Loading Strive...</h2>
          <div className="h-1 w-full bg-gray-200 rounded-full mt-1">
            <div className="h-1 bg-primary rounded-full animate-pulse" style={{width: '90%'}}></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-[#1E1E1E] pb-20 font-['Roboto',sans-serif] text-[#F5F5F5]">
      {user && (
        <header className="bg-primary text-white p-4 shadow-md">
          <div className="flex justify-between items-center max-w-lg mx-auto">
            <h1 className="text-xl font-bold font-['Inter',sans-serif]">Strive</h1>
            <div className="flex items-center space-x-2">
              <span className="material-icons">notifications</span>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <span className="material-icons text-sm">person</span>
              </div>
            </div>
          </div>
        </header>
      )}
      
      <main className="max-w-lg mx-auto">
        <Switch>
          <ProtectedRoute path="/" component={Dashboard} />
          <ProtectedRoute path="/workouts" component={Workouts} />
          <ProtectedRoute path="/workouts/create" component={CreateWorkout} />
          <Route path="/workouts/active/:id">
            {(params) => user ? <ActiveWorkout workoutId={parseInt(params.id, 10)} /> : <Redirect to="/auth" />}
          </Route>
          <Route path="/exercise/:id">
            {(params) => user ? <Exercise exerciseId={parseInt(params.id, 10)} /> : <Redirect to="/auth" />}
          </Route>
          <ProtectedRoute path="/nutrition" component={Nutrition} />
          <ProtectedRoute path="/health" component={Health} />
          <ProtectedRoute path="/profile" component={Profile} />
          <Route path="/auth" component={SignIn} />
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
