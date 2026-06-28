/**
 * Default (non-iOS) HealthSection: a no-op. The real implementation lives in
 * `HealthSection.ios.tsx` and Metro picks it on iOS. Apple Health is iOS-only;
 * Android's equivalent (Health Connect) is a separate, future integration.
 */
export function HealthSection() {
  return null;
}
