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
import Steps from "@/pages/steps";
import Water from "@/pages/water";
import Analytics from "@/pages/analytics";
import SignIn from "@/pages/sign-in";
import AuthPage from "@/pages/auth-page";
import BottomNavigation from "@/components/ui/bottom-navigation";
import { ProtectedRoute } from "@/lib/protected-route";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import Logo from "@/components/ui/logo";

function Router() {
  const { user, isLoading } = useAuth();
  
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
            <Logo size="sm" textClassName="text-white font-semibold" />
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-blue-700/30 flex items-center justify-center hover:bg-blue-600/30 transition-colors cursor-pointer">
                <span className="material-icons text-sm">notifications</span>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-700/30 flex items-center justify-center hover:bg-blue-600/30 transition-colors cursor-pointer">
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
          <ProtectedRoute path="/steps" component={Steps} />
          <ProtectedRoute path="/water" component={Water} />
          <ProtectedRoute path="/analytics" component={Analytics} />
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
