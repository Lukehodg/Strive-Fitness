import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { env, isAnalyticsConfigured } from "@/lib/env";

/**
 * Minimal, dependency-free product analytics. Posts funnel events straight to
 * PostHog's public capture endpoint via fetch — no native SDK, no autocapture,
 * no session replay, and a no-op until EXPO_PUBLIC_POSTHOG_KEY is set.
 *
 * Keep events to the core funnel (sign-in → profile → discover → join → chat).
 * Never put PII (phone, exact location, health data) in properties.
 */

const ANON_KEY = "analytics_anon_id";
let anonId: string | null = null;
let distinctId: string | null = null;

// Load or create a stable per-install id (used until the user signs in).
void (async () => {
  try {
    let id = await AsyncStorage.getItem(ANON_KEY);
    if (!id) {
      id = Crypto.randomUUID();
      await AsyncStorage.setItem(ANON_KEY, id);
    }
    anonId = id;
    distinctId ??= id;
  } catch {
    // analytics is best-effort; ignore storage errors
  }
})();

/** Pin events to the signed-in user (or back to the anon id on sign-out). */
export function setAnalyticsUser(userId: string | null) {
  distinctId = userId ?? anonId;
}

/** Fire-and-forget a funnel event. */
export function capture(event: string, properties?: Record<string, unknown>) {
  if (!isAnalyticsConfigured) return;
  const host = env.posthogHost.replace(/\/$/, "");
  fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.posthogKey,
      event,
      distinct_id: distinctId ?? "anonymous",
      properties: { ...(properties ?? {}), $lib: "stride-react-native" },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // never let analytics break a user action
  });
}
