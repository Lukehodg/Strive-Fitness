import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

/** Right of access / portability: returns a JSON bundle of the caller's data. */
export function useExportData() {
  return useMutation({
    mutationFn: async (): Promise<unknown> => {
      const { data, error } = await supabase.functions.invoke("account", {
        body: { action: "export" },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      return data;
    },
  });
}

/** Right to erasure: deletes the account (cascades all data), then signs out. */
export function useDeleteAccount() {
  const { signOut } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("account", {
        body: { action: "delete" },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    },
    onSuccess: async () => {
      await signOut();
    },
  });
}
