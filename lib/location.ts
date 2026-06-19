import * as Location from "expo-location";

export type Coords = { latitude: number; longitude: number };

/** Surrey commuter-belt fallback (Weybridge) so the map has a sane default. */
export const DEFAULT_REGION: Coords = { latitude: 51.3743, longitude: -0.4488 };

/**
 * Ask for foreground location permission and return current coords.
 * Returns null if the user declines — callers fall back to DEFAULT_REGION.
 */
export async function getCurrentCoords(): Promise<Coords | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

/** Best-effort reverse geocode to a coarse area label (e.g. "Weybridge"). */
export async function reverseGeocodeArea(coords: Coords): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coords);
    if (!place) return null;
    return place.city ?? place.subregion ?? place.region ?? null;
  } catch {
    return null;
  }
}
