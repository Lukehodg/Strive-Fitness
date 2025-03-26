import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type User = {
  id: number;
  username: string;
  displayName: string;
  [key: string]: any;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Check if user is already authenticated on load
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      
      try {
        // Try to get the current user data
        const response = await fetch('/api/user/1');
        
        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          // Set authentication flag in local storage
          localStorage.setItem("isAuthenticated", "true");
        }
      } catch (err) {
        console.error("Authentication check failed:", err);
        setError(err instanceof Error ? err : new Error("Authentication check failed"));
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // For demo purposes we're using the username field for emails
      const response = await apiRequest('POST', '/api/auth/signin', { 
        email: email, 
        password: password 
      });
      
      if (response.success) {
        setUser(response.user);
        localStorage.setItem("isAuthenticated", "true");
        
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
      } else {
        throw new Error(response.message || "Invalid email or password");
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Sign in failed"));
      
      toast({
        title: "Sign in failed",
        description: err instanceof Error ? err.message : "Invalid email or password",
        variant: "destructive",
      });
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest('POST', '/api/auth/signup', {
        username: email,
        displayName: name,
        password: password,
      });
      
      if (response.success) {
        setUser(response.user);
        localStorage.setItem("isAuthenticated", "true");
        
        toast({
          title: "Account created!",
          description: "You have successfully created an account.",
        });
      } else {
        throw new Error(response.message || "Registration failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Registration failed"));
      
      toast({
        title: "Registration failed",
        description: err instanceof Error ? err.message : "Could not create your account",
        variant: "destructive",
      });
      
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      // Call the server signout endpoint
      await apiRequest('POST', '/api/auth/signout');
      
      // Clear user data from state
      setUser(null);
      localStorage.removeItem("isAuthenticated");
      
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    } catch (err) {
      console.error("Sign out error:", err);
      
      // Even if the server request fails, clear the local session
      setUser(null);
      localStorage.removeItem("isAuthenticated");
      
      toast({
        title: "Sign out issue",
        description: "Your session has been ended but there was an issue with the server.",
        variant: "destructive",
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  
  return context;
}