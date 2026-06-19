import { QueryClient } from "@tanstack/react-query";

/**
 * Single shared TanStack Query client. Sensible mobile defaults: don't refetch
 * on every focus, keep data warm briefly, retry network blips once.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Centralized query keys so invalidation stays consistent across hooks. */
export const queryKeys = {
  profile: (userId: string) => ["profile", userId] as const,
  nearby: (lat: number, lng: number, radius: number) =>
    ["nearby", { lat, lng, radius }] as const,
  activity: (id: string) => ["activity", id] as const,
  roster: (activityId: string) => ["roster", activityId] as const,
  myGames: (userId: string) => ["my-games", userId] as const,
};
