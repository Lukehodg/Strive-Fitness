import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

// Types
export interface User {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  createdAt: string;
  updatedAt: string;
}

interface SignInCredentials {
  username: string;
  password: string;
}

interface SignUpData {
  username: string;
  displayName: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isSigningIn: boolean;
  isSigningUp: boolean;
  error: Error | null;
  signIn: (credentials: SignInCredentials) => Promise<void>;
  signUp: (data: SignUpData) => Promise<void>;
  signOut: () => Promise<void>;
  getIsSubscribed: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const queryClient = useQueryClient();

  // Query to fetch the current user
  const {
    data: userData,
    isLoading,
    error: userError,
    refetch,
  } = useQuery({
    queryKey: ['/api/user'],
    queryFn: async () => {
      try {
        const data = await api.getCurrentUser();
        return data;
      } catch (err) {
        // If 401 or other auth error, just return null instead of throwing
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Sign In Mutation
  const {
    mutateAsync: signInMutation,
    isPending: isSigningIn,
    error: signInError,
  } = useMutation({
    mutationFn: async (credentials: SignInCredentials) => {
      const response = await api.signIn(credentials);
      return response;
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.setQueryData(['/api/user'], data);
      setError(null);
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Sign Up Mutation
  const {
    mutateAsync: signUpMutation,
    isPending: isSigningUp,
    error: signUpError,
  } = useMutation({
    mutationFn: async (data: SignUpData) => {
      const response = await api.signUp(data);
      return response;
    },
    onSuccess: (data) => {
      setUser(data);
      queryClient.setQueryData(['/api/user'], data);
      setError(null);
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Sign Out Mutation
  const {
    mutateAsync: signOutMutation,
    isPending: isSigningOut,
    error: signOutError,
  } = useMutation({
    mutationFn: async () => {
      await api.signOut();
    },
    onSuccess: () => {
      setUser(null);
      queryClient.setQueryData(['/api/user'], null);
      // Clear cache
      queryClient.clear();
    },
    onError: (error: Error) => {
      setError(error);
    },
  });

  // Check subscription status
  const getIsSubscribed = async (): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const subscription = await api.getUserSubscription(user.id);
      return subscription && subscription.status === 'active';
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  };

  // Wrap the mutations to handle promises properly
  const signIn = async (credentials: SignInCredentials): Promise<void> => {
    try {
      await signInMutation(credentials);
    } catch (error) {
      throw error;
    }
  };

  const signUp = async (data: SignUpData): Promise<void> => {
    try {
      await signUpMutation(data);
    } catch (error) {
      throw error;
    }
  };

  const signOut = async (): Promise<void> => {
    try {
      await signOutMutation();
    } catch (error) {
      throw error;
    }
  };

  // Update user when userData changes
  useEffect(() => {
    if (userData) {
      setUser(userData);
    } else {
      setUser(null);
    }
  }, [userData]);

  useEffect(() => {
    if (userError) {
      setError(userError as Error);
    }
  }, [userError]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSigningIn,
        isSigningUp,
        error,
        signIn,
        signUp,
        signOut,
        getIsSubscribed,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};