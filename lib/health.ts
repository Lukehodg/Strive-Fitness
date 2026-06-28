/**
 * Pure, native-free helpers for the Apple Health section. The actual HealthKit
 * calls live in `components/HealthSection.ios.tsx` (iOS only) — this file is
 * safe to import anywhere.
 *
 * Apple Health data stays ON-DEVICE: we read recent workouts live and render
 * them on the owner's profile. Nothing is written to Supabase, which keeps
 * sensitive health data off our servers (and out of GDPR "special category"
 * storage territory).
 */

export function formatHealthDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function formatHealthDistance(meters: number | null | undefined): string | null {
  if (!meters) return null;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatHealthEnergy(kcal: number | null | undefined): string | null {
  if (!kcal) return null;
  return `${Math.round(kcal)} kcal`;
}
