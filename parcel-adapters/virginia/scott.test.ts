import { describe, expect, it } from "vitest";
import { createScottCountyVaAdapter } from "./scott.js";

const adapter = createScottCountyVaAdapter();

const validRaw = {
  type: "Feature",
  properties: {
    PIN: "012-A-1-23",
    LocAddress: "100 Main St",
    LocCity: "Gate City",
    LocZip: "24251",
    YearBuilt: 1985,
    AssessedValue: 142000,
    FIPS: "51169",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-82.59, 36.71],
        [-82.58, 36.71],
        [-82.58, 36.72],
        [-82.59, 36.72],
        [-82.59, 36.71],
      ],
    ],
  },
};

describe("scott county adapter", () => {
  it("exposes Scott County metadata", () => {
    expect(adapter.meta.stateFips).toBe("51");
    expect(adapter.meta.countyFips).toBe("169");
  });

  it("normalizes a typical VGIN feature", () => {
    const out = adapter.normalize(validRaw);
    expect(out).not.toBeNull();
    expect(out?.external_id).toBe("012-A-1-23");
    expect(out?.address_line1).toBe("100 Main St");
    expect(out?.postal_code).toBe("24251");
    expect(out?.year_built).toBe(1985);
    expect(out?.assessed_value_usd).toBe(142000);
    expect(out?.centroid.coordinates[0]).toBeCloseTo(-82.585, 3);
    expect(out?.centroid.coordinates[1]).toBeCloseTo(36.715, 3);
  });

  it("falls back to alternate field names", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: {
        ParcelID: "999",
        SitusAddress: "1 Other Rd",
        SitusCity: "Weber City",
        SitusZip: "24290-1234",
      },
      geometry: { type: "Point", coordinates: [-82.6, 36.6] },
    });
    expect(out?.external_id).toBe("999");
    expect(out?.postal_code).toBe("24290-1234");
  });

  it("rejects features missing a parcel id", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { LocAddress: "x", LocCity: "y", LocZip: "24251" },
      geometry: { type: "Point", coordinates: [-82.6, 36.6] },
    });
    expect(out).toBeNull();
  });

  it("rejects features missing geometry", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { PIN: "1", LocAddress: "x", LocCity: "y", LocZip: "24251" },
      geometry: null,
    });
    expect(out).toBeNull();
  });

  it("rejects malformed postal code", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { PIN: "1", LocAddress: "x", LocCity: "y", LocZip: "abcde" },
      geometry: { type: "Point", coordinates: [-82.6, 36.6] },
    });
    expect(out).toBeNull();
  });
});
