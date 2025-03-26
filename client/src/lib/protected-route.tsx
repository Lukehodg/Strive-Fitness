import { useLocation, Route, Redirect } from "wouter";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType;
}

export function ProtectedRoute({ path, component: Component }: ProtectedRouteProps) {
  const [location] = useLocation();
  
  // This is a simplified authentication check - in a real app, would use useAuth hook
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const isLoading = false; // Would be provided by useAuth hook
  
  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Route>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }
  
  return <Route path={path} component={Component} />;
}