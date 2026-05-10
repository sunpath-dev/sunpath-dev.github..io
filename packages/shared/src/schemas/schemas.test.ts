import { describe, expect, it } from "vitest";
import { ParcelSchema } from "./parcel.js";
import { DoorEventSchema } from "./door-event.js";
import { LeadSchema } from "./lead.js";

const validParcel = {
  external_id: "0123-A",
  state_fips: "51",
  county_fips: "169",
  address_line1: "100 Main St",
  city: "Gate City",
  state: "VA",
  postal_code: "24251",
  centroid: { type: "Point", coordinates: [-82.59, 36.71] },
  primary_orientation: "S",
  has_existing_solar: false,
};

describe("ParcelSchema", () => {
  it("accepts a minimal valid parcel", () => {
    expect(() => ParcelSchema.parse(validParcel)).not.toThrow();
  });

  it("rejects an invalid state FIPS", () => {
    expect(() =>
      ParcelSchema.parse({ ...validParcel, state_fips: "VA" }),
    ).toThrow();
  });

  it("rejects bad postal code", () => {
    expect(() =>
      ParcelSchema.parse({ ...validParcel, postal_code: "abcde" }),
    ).toThrow();
  });

  it("defaults primary_orientation to unknown", () => {
    const { primary_orientation, ...rest } = validParcel;
    void primary_orientation;
    const out = ParcelSchema.parse(rest);
    expect(out.primary_orientation).toBe("unknown");
  });
});

describe("DoorEventSchema", () => {
  it("accepts a valid event", () => {
    expect(() =>
      DoorEventSchema.parse({
        parcel_id: "00000000-0000-4000-8000-000000000001",
        rep_id: "00000000-0000-4000-8000-000000000002",
        occurred_at: "2026-05-09T15:00:00.000Z",
        outcome: "no_answer",
        client_event_id: "00000000-0000-4000-8000-000000000003",
      }),
    ).not.toThrow();
  });

  it("rejects unknown outcomes", () => {
    expect(() =>
      DoorEventSchema.parse({
        parcel_id: "00000000-0000-4000-8000-000000000001",
        rep_id: "00000000-0000-4000-8000-000000000002",
        occurred_at: "2026-05-09T15:00:00.000Z",
        outcome: "made_up",
        client_event_id: "00000000-0000-4000-8000-000000000003",
      }),
    ).toThrow();
  });
});

describe("LeadSchema", () => {
  it("defaults stage to 'new'", () => {
    const out = LeadSchema.parse({
      parcel_id: "00000000-0000-4000-8000-000000000001",
      rep_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(out.stage).toBe("new");
  });

  it("rejects malformed email", () => {
    expect(() =>
      LeadSchema.parse({
        parcel_id: "00000000-0000-4000-8000-000000000001",
        rep_id: "00000000-0000-4000-8000-000000000002",
        email: "not-an-email",
      }),
    ).toThrow();
  });
});
