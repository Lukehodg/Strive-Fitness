import { Switch, Route, Redirect, Link, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  CalendarDays,
  Dumbbell,
  Utensils,
  Heart,
  Link2,
  Settings,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { Toaster } from "./components/ui/toaster";
import Today from "./pages/today";
import Connections from "./pages/connections";
import AuthPage from "./pages/auth-page";
import Workouts from "./pages/workouts";
import CreateWorkout from "./pages/create-workout";
import ActiveWorkout from "./pages/active-workout";
import Exercise from "./pages/exercise";
import Nutrition from "./pages/nutrition";
import Health from "./pages/health";
import Medications from "./pages/medications";
import WeeklyPlan from "./pages/weekly-plan";
import AccountSettings from "./pages/account-settings";
import NotFound from "./pages/not-found";

const navigation = [
  { path: "/", label: "Today", icon: CalendarDays },
  { path: "/workouts", label: "Train", icon: Dumbbell },
  { path: "/nutrition", label: "Food", icon: Utensils },
  { path: "/health", label: "Health", icon: Heart },
  { path: "/connections", label: "Connections", icon: Link2 },
];
function Shell() {
  const { user, isLoading, signOut } = useAuth();
  const [location] = useLocation();
  const [signOutError, setSignOutError] = useState("");
  if (isLoading)
    return (
      <div className="app-loading" role="status">
        Opening your Strive account…
      </div>
    );
  if (!user) return <AuthPage />;
  const navLinks = navigation.map(({ path, label, icon: Icon }) => (
    <Link
      key={path}
      href={path}
      className={`shell-link ${location === path || (path !== "/" && location.startsWith(path)) ? "selected" : ""}`}
      aria-current={location === path ? "page" : undefined}
    >
      <Icon size={19} />
      <span>{label}</span>
    </Link>
  ));
  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <Link className="strive-wordmark" href="/">
          STRIVE<span>FITNESS</span>
        </Link>
        <p className="sidebar-caption">YOUR EVERYDAY PROGRESS</p>
        <nav aria-label="Main navigation">{navLinks}</nav>
        <div className="sidebar-bottom">
          <Link href="/medications" className="shell-link">
            <Heart size={19} />
            Your routine
          </Link>
          <Link href="/account-settings" className="shell-link">
            <Settings size={19} />
            Settings
          </Link>
          <button
            className="shell-link"
            onClick={() => {
              void signOut().catch(() =>
                setSignOutError("Could not sign out. Please retry."),
              );
            }}
          >
            <LogOut size={19} />
            Sign out
          </button>
          {signOutError && (
            <p role="alert" className="form-error">
              {signOutError}
            </p>
          )}
          <div className="account-label">
            <span className="avatar-letter">
              {user.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              {user.displayName}
              <small>Private beta</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <span>YOUR SPACE TO STRIVE</span>
          <Link href="/account-settings">
            {user.displayName}
            <Settings size={16} />
          </Link>
        </header>
        <main
          className={
            ["/", "/connections"].includes(location)
              ? "app-main"
              : "app-main legacy-page"
          }
        >
          <Switch>
            <Route path="/" component={Today} />
            <Route path="/connections" component={Connections} />
            <Route path="/workouts/create" component={CreateWorkout} />
            <Route path="/workouts/active/:id">
              {(params) =>
                /^\d+$/.test(params.id) ? (
                  <ActiveWorkout workoutId={Number(params.id)} />
                ) : (
                  <NotFound />
                )
              }
            </Route>
            <Route path="/workouts" component={Workouts} />
            <Route path="/exercise/:id">
              {(params) =>
                /^\d+$/.test(params.id) ? (
                  <Exercise exerciseId={Number(params.id)} />
                ) : (
                  <NotFound />
                )
              }
            </Route>
            <Route path="/nutrition" component={Nutrition} />
            <Route path="/health" component={Health} />
            <Route path="/medications" component={Medications} />
            <Route path="/weekly-plan" component={WeeklyPlan} />
            <Route path="/account-settings" component={AccountSettings} />
            <Route path="/profile">
              <Redirect to="/account-settings" />
            </Route>
            <Route path="/auth">
              <Redirect to="/" />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
        <nav className="mobile-navigation" aria-label="Mobile navigation">
          {navLinks}
        </nav>
        <footer className="app-footer">
          Built for consistency. Made for you.
          <Link href="/connections">
            Connection roadmap <ArrowUpRight size={13} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Shell />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
