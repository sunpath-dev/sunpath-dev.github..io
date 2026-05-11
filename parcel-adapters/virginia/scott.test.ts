import { describe, expect, it } from "vitest";
import { createScottCountyVaAdapter } from "./scott.js";

const adapter = createScottCountyVaAdapter();

const validRaw = {
  type: "Feature",
  properties: {
    ADDPTKEY: "012-A-1-23",
    FULLADDR: "100 MAIN ST",
    PO_NAME: "Gate City",
    ZIP_5: 24251,
    FIPS: "51169",
  },
  geometry: {
    type: "Point",
    coordinates: [-82.59, 36.71],
  },
};

describe("scott county adapter", () => {
  it("exposes Scott County metadata", () => {
    expect(adapter.meta.stateFips).toBe("51");
    expect(adapter.meta.countyFips).toBe("169");
  });

  it("normalizes a typical VGIN address-point feature", () => {
    const out = adapter.normalize(validRaw);
    expect(out).not.toBeNull();
    expect(out?.external_id).toBe("012-A-1-23");
    expect(out?.address_line1).toBe("100 MAIN ST");
    expect(out?.city).toBe("Gate City");
    expect(out?.postal_code).toBe("24251");
    expect(out?.centroid.type).toBe("Point");
    expect(out?.centroid.coordinates[0]).toBeCloseTo(-82.59, 3);
    expect(out?.centroid.coordinates[1]).toBeCloseTo(36.71, 3);
  });

  it("pads integer ZIP_5 to 5 digits", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { ADDPTKEY: "999", FULLADDR: "1 Other Rd", PO_NAME: "Weber City", ZIP_5: 1234 },
      geometry: { type: "Point", coordinates: [-82.6, 36.6] },
    });
    expect(out?.postal_code).toBe("01234");
  });

  it("falls back to MUNICIPALITY when PO_NAME is absent", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { ADDPTKEY: "abc", FULLADDR: "2 Oak Ave", MUNICIPALITY: "Duffield", ZIP_5: 24244 },
      geometry: { type: "Point", coordinates: [-82.7, 36.8] },
    });
    expect(out?.city).toBe("Duffield");
  });

  it("rejects features missing an ADDPTKEY", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { FULLADDR: "100 Main St", PO_NAME: "Gate City", ZIP_5: 24251 },
      geometry: { type: "Point", coordinates: [-82.6, 36.6] },
    });
    expect(out).toBeNull();
  });

  it("rejects features missing geometry", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { ADDPTKEY: "1", FULLADDR: "100 Main St", PO_NAME: "Gate City", ZIP_5: 24251 },
      geometry: null,
    });
    expect(out).toBeNull();
  });

  it("rejects features with non-Point geometry", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { ADDPTKEY: "1", FULLADDR: "100 Main St", PO_NAME: "Gate City", ZIP_5: 24251 },
      geometry: { type: "Polygon", coordinates: [[[-82.6, 36.6], [-82.5, 36.6], [-82.5, 36.7], [-82.6, 36.6]]] },
    });
    expect(out).toBeNull();
  });

  it("rejects features with missing or zero ZIP_5", () => {
    const out = adapter.normalize({
      type: "Feature",
      properties: { ADDPTKEY: "1", FULLADDR: "100 Main St", PO_NAME: "Gate City", ZIP_5: 0 },
      geometry: { type: "Point", coordinates: [-82.6, 36.6] },
    });
    expect(out).toBeNull();
  });
});
