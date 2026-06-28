// Shared Sentry reporting for Edge Functions. No-op unless SENTRY_DSN is set
// (set it server-side: `supabase secrets set SENTRY_DSN=...`). We never send
// PII — health/location/phone must not land in a crash payload.
//
// deno-lint-ignore-file no-explicit-any
import * as Sentry from "https://esm.sh/@sentry/deno@8";

const dsn = Deno.env.get("SENTRY_DSN");
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0, sendDefaultPii: false });
}

/** Report an error, then flush (Edge Functions are short-lived). Best-effort. */
export async function captureError(e: unknown, context?: Record<string, unknown>) {
  if (!dsn) return;
  try {
    Sentry.captureException(e, context ? { extra: context } : undefined);
    await Sentry.flush(2000);
  } catch (_e) {
    // reporting must never break the handler
  }
}
