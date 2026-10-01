import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { request, ApiError, type Account } from "./api";
const key = "strive.session";
type Session = {
  token: string | null;
  user: Account | null;
  loading: boolean;
  error: string;
  retry: () => Promise<void>;
  authenticate: (
    email: string,
    password: string,
    name?: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const restore = useCallback(async () => {
    try {
      const saved = await SecureStore.getItemAsync(key);
      setLoading(true);
      setError("");
      if (saved) {
        const account = await request<Account>("/api/auth/me", saved);
        setToken(saved);
        setUser(account);
      } else {
        setToken(null);
        setUser(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await SecureStore.deleteItemAsync(key);
        setToken(null);
        setUser(null);
      } else
        setError(
          err instanceof Error
            ? err.message
            : "Could not restore your session.",
        );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Bootstrap from the external secure store; state changes occur after its async read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);
  async function authenticate(email: string, password: string, name?: string) {
    const data = await request<{ user: Account; token: string }>(
      `/api/auth/${name ? "signup" : "signin"}`,
      null,
      "POST",
      {
        email,
        password,
        ...(name
          ? {
              displayName: name,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : {}),
      },
    );
    await SecureStore.setItemAsync(key, data.token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    setToken(data.token);
    setUser(data.user);
    setError("");
  }
  async function signOut() {
    try {
      await request("/api/auth/signout", token, "POST");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
    await SecureStore.deleteItemAsync(key);
    setToken(null);
    setUser(null);
  }
  return (
    <Context.Provider
      value={{
        token,
        user,
        loading,
        error,
        retry: restore,
        authenticate,
        signOut,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const session = useContext(Context);
  if (!session) throw new Error("Missing session provider");
  return session;
}
