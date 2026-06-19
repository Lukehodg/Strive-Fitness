import { supabase } from "@/lib/supabase";

/**
 * Upload a local image uri to the `avatars` bucket under `<userId>/...` (the
 * folder prefix is what the storage RLS policy checks). Returns a public URL.
 */
export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();
  const ext = uri.split(".").pop()?.split("?")[0] ?? "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, arrayBuffer, {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
