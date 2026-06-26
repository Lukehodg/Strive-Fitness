import { toPoint } from "@/lib/supabase";

describe("toPoint", () => {
  it("builds an EWKT point as 'lng lat' (PostGIS axis order)", () => {
    expect(toPoint(-0.4488, 51.3743)).toBe("SRID=4326;POINT(-0.4488 51.3743)");
  });
});
