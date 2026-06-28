import Constants from "expo-constants";

/**
 * Typed accessor for runtime config injected in app.config.ts.
 * Only public values live here — never the service role or Stream secret.
 */
type Extra = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  streamApiKey: string;
  googleWebClientId: string;
  googleIosClientId: string;
  stravaClientId: string;
  sentryDsn: string;
  posthogKey: string;
  posthogHost: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

// Placeholder so `createClient` doesn't throw at import when no .env is present
// — the app boots into a "needs configuration" state instead of white-screening.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "public-anon-placeholder";

function read(key: keyof Extra, fallback: string): string {
  const value = extra[key];
  if (!value) {
    // Surfaced loudly in dev so a missing .env is obvious, not a silent null.
    console.warn(
      `[env] Missing "${key}". Copy .env.example to .env and fill it in (see SETUP.md).`,
    );
    return fallback;
  }
  return value;
}

export const env = {
  supabaseUrl: read("supabaseUrl", PLACEHOLDER_URL),
  supabaseAnonKey: read("supabaseAnonKey", PLACEHOLDER_KEY),
  streamApiKey: extra.streamApiKey ?? "",
  googleWebClientId: extra.googleWebClientId ?? "",
  googleIosClientId: extra.googleIosClientId ?? "",
  stravaClientId: extra.stravaClientId ?? "",
  sentryDsn: extra.sentryDsn ?? "",
  posthogKey: extra.posthogKey ?? "",
  posthogHost: extra.posthogHost || "https://eu.i.posthog.com",
};

/** True when Supabase has been configured with real credentials. */
export const isSupabaseConfigured =
  env.supabaseUrl !== PLACEHOLDER_URL && env.supabaseAnonKey !== PLACEHOLDER_KEY;

/** True when Stream Chat has been configured. */
export const isStreamConfigured = env.streamApiKey.length > 0;

/** True when Strava OAuth has been configured (client id present). */
export const isStravaConfigured = env.stravaClientId.length > 0;

/** True when Sentry crash reporting has been configured (DSN present). */
export const isSentryConfigured = env.sentryDsn.length > 0;

/** True when PostHog analytics has been configured (project key present). */
export const isAnalyticsConfigured = env.posthogKey.length > 0;
