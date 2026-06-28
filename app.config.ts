import { ConfigContext, ExpoConfig } from "expo/config";

// Loads static config from app.json, then injects secrets from the environment
// (.env locally, EAS secrets in CI). Keeps keys out of version control while
// still exposing them to the app via `Constants.expoConfig.extra`.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? config.extra?.supabaseUrl ?? "",
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? config.extra?.supabaseAnonKey ?? "",
    streamApiKey: process.env.EXPO_PUBLIC_STREAM_API_KEY ?? config.extra?.streamApiKey ?? "",
    googleWebClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? config.extra?.googleWebClientId ?? "",
    googleIosClientId:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? config.extra?.googleIosClientId ?? "",
    stravaClientId:
      process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? config.extra?.stravaClientId ?? "",
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? config.extra?.sentryDsn ?? "",
    eas: config.extra?.eas,
  },
});
