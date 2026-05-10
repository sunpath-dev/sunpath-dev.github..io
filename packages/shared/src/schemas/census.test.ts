import { describe, expect, it } from "vitest";
import {
  CensusContextSchema,
  CensusRequestSchema,
} from "./census.js";

describe("CensusRequestSchema", () => {
  it("requires 2/3-digit FIPS codes", () => {
    expect(
      CensusRequestSchema.safeParse({ state_fips: "51", county_fips: "169" })
        .success,
    ).toBe(true);
    expect(
      CensusRequestSchema.safeParse({ state_fips: "5", county_fips: "169" })
        .success,
    ).toBe(false);
  });
});

describe("CensusContextSchema", () => {
  it("validates a full payload", () => {
    const r = CensusContextSchema.safeParse({
      state_fips: "51",
      county_fips: "169",
      tract: null,
      owner_occupied_pct: 78.4,
      median_household_income_usd: 51000,
      median_home_value_usd: 132000,
      vintage: 2022,
    });
    expect(r.success).toBe(true);
  });
  it("rejects out-of-range owner pct", () => {
    const r = CensusContextSchema.safeParse({
      state_fips: "51",
      county_fips: "169",
      tract: null,
      owner_occupied_pct: 150,
      median_household_income_usd: null,
      median_home_value_usd: null,
      vintage: 2022,
    });
    expect(r.success).toBe(false);
  });
});
