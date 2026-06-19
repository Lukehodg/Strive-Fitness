import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase, toPoint } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/types/database";

/** The signed-in user's profile, or null if they haven't created one yet. */
export function useMyProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.profile(user?.id ?? "anon"),
    enabled: !!user,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export type ProfileInput = {
  display_name: string;
  area_label?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  location?: { latitude: number; longitude: number } | null;
};

/** Create or update the signed-in user's profile (upsert on id). */
export function useUpsertProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProfileInput): Promise<Profile> => {
      if (!user) throw new Error("Not signed in");
      const { location, ...rest } = input;
      const { data, error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          ...rest,
          home_location: location ? toPoint(location.longitude, location.latitude) : null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (profile) => {
      qc.setQueryData(queryKeys.profile(profile.id), profile);
    },
  });
}
