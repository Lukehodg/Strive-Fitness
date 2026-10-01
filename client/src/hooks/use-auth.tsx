import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User as StoredUser } from "@shared/schema";
type User = Omit<StoredUser, "password">;
type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};
export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    localStorage.removeItem("isAuthenticated");
    fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) return null;
        if (!res.ok)
          throw new Error("Could not check your session. Please retry.");
        return res.json();
      })
      .then(setUser)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function authenticate(path: string, data: unknown) {
    setError(null);
    try {
      const res = await apiRequest("POST", path, data);
      const account = await res.json();
      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(account);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unable to sign in."));
      throw err;
    }
  }
  async function signOut() {
    await apiRequest("POST", "/api/auth/signout");
    await queryClient.cancelQueries();
    queryClient.clear();
    setUser(null);
    setError(null);
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        signIn: (email, password) =>
          authenticate("/api/auth/signin", { email, password }),
        signUp: (displayName, email, password) =>
          authenticate("/api/auth/signup", {
            displayName,
            email,
            password,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        signOut,
        refreshUser: async () => {
          const response = await apiRequest("GET", "/api/auth/me");
          setUser(await response.json());
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Missing AuthProvider");
  return value;
}
