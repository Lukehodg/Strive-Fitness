import * as Location from "expo-location";

import {
  coarseCoords,
  getCurrentCoords,
  reverseGeocodeArea,
  DEFAULT_REGION,
} from "@/lib/location";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

const mocked = Location as jest.Mocked<typeof Location>;

describe("getCurrentCoords", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns coords when permission is granted", async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" } as never);
    mocked.getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 51.37, longitude: -0.44 },
    } as never);

    await expect(getCurrentCoords()).resolves.toEqual({ latitude: 51.37, longitude: -0.44 });
  });

  it("returns null when permission is denied", async () => {
    mocked.requestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" } as never);
    await expect(getCurrentCoords()).resolves.toBeNull();
    expect(mocked.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("returns null (does not throw) when the permission API rejects", async () => {
    // Regression: a rejecting/hanging permission call used to leave Discover
    // stuck on a spinner forever.
    mocked.requestForegroundPermissionsAsync.mockRejectedValue(new Error("unsupported"));
    await expect(getCurrentCoords()).resolves.toBeNull();
  });
});

describe("coarseCoords", () => {
  it("rounds to 3 decimals (~110m)", () => {
    expect(coarseCoords({ latitude: 51.374312, longitude: -0.448771 })).toEqual({
      latitude: 51.374,
      longitude: -0.449,
    });
  });

  it("keeps nearby fixes on the same key", () => {
    // Two GPS fixes a few metres apart must produce identical coords, so
    // Discover and the Nearby map share one cached query.
    const a = coarseCoords({ latitude: 51.37411, longitude: -0.44882 });
    const b = coarseCoords({ latitude: 51.37414, longitude: -0.44879 });
    expect(a).toEqual(b);
  });
});

describe("reverseGeocodeArea", () => {
  it("returns a coarse area label", async () => {
    mocked.reverseGeocodeAsync.mockResolvedValue([{ city: "Weybridge" }] as never);
    await expect(reverseGeocodeArea(DEFAULT_REGION)).resolves.toBe("Weybridge");
  });

  it("returns null on failure", async () => {
    mocked.reverseGeocodeAsync.mockRejectedValue(new Error("nope"));
    await expect(reverseGeocodeArea(DEFAULT_REGION)).resolves.toBeNull();
  });
});
