import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { env } from "@/lib/env";

/**
 * Typed Supabase client for the app. Uses the ANON key only — RLS does the
 * authorization. The service-role key must never appear in the app bundle.
 *
 * Session is persisted in AsyncStorage and auto-refreshed. Detecting the
 * session in the URL is off (we handle OAuth redirects via expo-auth-session).
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Build a PostGIS WKT point string from lng/lat for inserts. */
export function toPoint(lng: number, lat: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}
