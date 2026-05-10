import { describe, expect, it } from "vitest";
import {
  IncentiveSchema,
  IncentivesRequestSchema,
  IncentivesResponseSchema,
} from "./incentives.js";

const itc = {
  id: "fed:itc",
  name: "Residential Clean Energy Credit",
  scope: "federal" as const,
  summary: "30% federal tax credit through 2032.",
  kind: "tax_credit" as const,
  max_benefit_usd: null,
  benefit_pct: 30,
  expires_on: "2032-12-31",
  source_url: "https://www.irs.gov/credits-deductions/residential-clean-energy-credit",
};

describe("IncentiveSchema", () => {
  it("accepts a valid federal ITC", () => {
    expect(IncentiveSchema.safeParse(itc).success).toBe(true);
  });

  it("rejects benefit_pct out of range", () => {
    expect(
      IncentiveSchema.safeParse({ ...itc, benefit_pct: 250 }).success,
    ).toBe(false);
  });

  it("rejects malformed source_url", () => {
    expect(
      IncentiveSchema.safeParse({ ...itc, source_url: "not a url" }).success,
    ).toBe(false);
  });
});

describe("IncentivesResponseSchema", () => {
  it("validates a response payload", () => {
    const r = IncentivesResponseSchema.safeParse({
      state: "VA",
      fetched_at: new Date().toISOString(),
      is_fallback: true,
      programs: [itc],
    });
    expect(r.success).toBe(true);
  });
});

describe("IncentivesRequestSchema", () => {
  it("requires a 2-letter state", () => {
    expect(IncentivesRequestSchema.safeParse({ state: "VA" }).success).toBe(true);
    expect(
      IncentivesRequestSchema.safeParse({ state: "Virginia" }).success,
    ).toBe(false);
  });

  it("validates postal code shape when provided", () => {
    expect(
      IncentivesRequestSchema.safeParse({ state: "VA", postal_code: "24251" }).success,
    ).toBe(true);
    expect(
      IncentivesRequestSchema.safeParse({ state: "VA", postal_code: "242" }).success,
    ).toBe(false);
  });
});
