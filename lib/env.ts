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
};

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

function required(key: keyof Extra): string {
  const value = extra[key];
  if (!value) {
    // Surfaced loudly in dev so a missing .env is obvious, not a silent null.
    console.warn(
      `[env] Missing "${key}". Copy .env.example to .env and fill it in (see SETUP.md).`,
    );
    return "";
  }
  return value;
}

export const env = {
  supabaseUrl: required("supabaseUrl"),
  supabaseAnonKey: required("supabaseAnonKey"),
  streamApiKey: required("streamApiKey"),
  googleWebClientId: extra.googleWebClientId ?? "",
  googleIosClientId: extra.googleIosClientId ?? "",
};
