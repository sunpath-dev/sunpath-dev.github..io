import { describe, expect, it } from "vitest";
import { pinsToGeoJSON, type ParcelPin } from "./pins.js";

const basePin: ParcelPin = {
  id: "00000000-0000-0000-0000-000000000001",
  external_id: "PIN-1",
  address_line1: "100 Main St",
  city: "Gate City",
  state: "VA",
  postal_code: "24251",
  lon: -82.59,
  lat: 36.71,
  has_existing_solar: false,
  owner_occupied: true,
  assessed_value_usd: 250_000,
  year_built: 2005,
  primary_orientation: "S",
};

describe("pinsToGeoJSON", () => {
  it("returns a FeatureCollection with score property", () => {
    const fc = pinsToGeoJSON([basePin]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0]!;
    expect(f.geometry.type).toBe("Point");
    expect(f.properties).toBeDefined();
    expect(typeof f.properties!.score).toBe("number");
    expect(f.properties!.score).toBeGreaterThan(0);
    expect(f.properties!.existing).toBe(0);
  });

  it("emits score=-1 when the parcel has existing solar (excluded)", () => {
    const fc = pinsToGeoJSON([{ ...basePin, has_existing_solar: true }]);
    const f = fc.features[0]!;
    expect(f.properties!.existing).toBe(1);
    expect(f.properties!.score).toBe(-1);
  });

  it("tolerates unknown roof orientation strings", () => {
    const fc = pinsToGeoJSON([
      { ...basePin, primary_orientation: "weird-value" },
    ]);
    const f = fc.features[0]!;
    expect(typeof f.properties!.score).toBe("number");
  });

  it("handles null assessed_value/year_built without crashing", () => {
    const fc = pinsToGeoJSON([
      { ...basePin, assessed_value_usd: null, year_built: null },
    ]);
    const f = fc.features[0]!;
    expect(typeof f.properties!.score).toBe("number");
  });
});
