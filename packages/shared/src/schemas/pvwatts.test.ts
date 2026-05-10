import { describe, expect, it } from "vitest";
import { PvWattsEstimateSchema, PvWattsRequestSchema } from "./pvwatts.js";

describe("PvWattsRequestSchema", () => {
  it("applies sensible defaults", () => {
    const parsed = PvWattsRequestSchema.parse({ lat: 36.6, lon: -82.6 });
    expect(parsed.system_capacity_kw).toBe(7);
    expect(parsed.tilt).toBe(20);
    expect(parsed.azimuth).toBe(180);
    expect(parsed.losses_pct).toBe(14);
  });

  it("rejects out-of-range coords", () => {
    expect(() =>
      PvWattsRequestSchema.parse({ lat: 100, lon: 0 }),
    ).toThrow();
  });

  it("accepts an explicit utility rate", () => {
    const parsed = PvWattsRequestSchema.parse({
      lat: 36.6,
      lon: -82.6,
      utility_rate_usd_per_kwh: 0.13,
    });
    expect(parsed.utility_rate_usd_per_kwh).toBe(0.13);
  });
});

describe("PvWattsEstimateSchema", () => {
  it("validates a normalized response", () => {
    const ok = PvWattsEstimateSchema.safeParse({
      inputs: {
        lat: 36.6,
        lon: -82.6,
        system_capacity_kw: 7,
        module_type: 0,
        array_type: 1,
        tilt: 20,
        azimuth: 180,
        losses_pct: 14,
      },
      ac_annual_kwh: 9100,
      ac_monthly_kwh: [
        500, 600, 750, 850, 950, 1000, 1050, 1000, 900, 800, 600, 500,
      ],
      dc_annual_kwh: 9700,
      capacity_factor: 0.18,
      est_annual_savings_usd: 1183,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects monthly arrays that aren't length 12", () => {
    const bad = PvWattsEstimateSchema.safeParse({
      inputs: {
        lat: 36.6,
        lon: -82.6,
        system_capacity_kw: 7,
        module_type: 0,
        array_type: 1,
        tilt: 20,
        azimuth: 180,
        losses_pct: 14,
      },
      ac_annual_kwh: 9100,
      ac_monthly_kwh: [500, 600, 750],
      dc_annual_kwh: 9700,
      capacity_factor: 0.18,
      est_annual_savings_usd: null,
    });
    expect(bad.success).toBe(false);
  });
});
