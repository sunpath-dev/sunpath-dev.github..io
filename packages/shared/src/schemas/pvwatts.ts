import { z } from "zod";

/**
 * PVWatts v8 normalized response — what our `pvwatts-fetch` Edge Function
 * returns to the client. The raw NREL response is reshaped server-side so
 * the browser never sees the API key and we get a stable contract.
 *
 * Source: https://developer.nrel.gov/docs/solar/pvwatts/v8/
 */
export const PvWattsEstimateSchema = z.object({
  /** Echo of the input, post-normalization. */
  inputs: z.object({
    lat: z.number(),
    lon: z.number(),
    /** DC system size, kW. */
    system_capacity_kw: z.number().positive(),
    /** PVWatts module type (0=standard, 1=premium, 2=thin film). */
    module_type: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    /** PVWatts array type (0=fixed open, 1=fixed roof, …). */
    array_type: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
    /** Tilt in degrees. */
    tilt: z.number(),
    /** Azimuth in degrees (180 = south). */
    azimuth: z.number(),
    /** System losses, percent. */
    losses_pct: z.number(),
  }),
  /** Annual AC output, kWh. */
  ac_annual_kwh: z.number().nonnegative(),
  /** Monthly AC output, kWh — Jan…Dec. */
  ac_monthly_kwh: z.array(z.number().nonnegative()).length(12),
  /** Annual DC output, kWh. */
  dc_annual_kwh: z.number().nonnegative(),
  /** Capacity factor (0–1). */
  capacity_factor: z.number().min(0).max(1),
  /** Estimated annual savings at given utility rate, USD. Optional. */
  est_annual_savings_usd: z.number().nonnegative().nullable(),
  /** NREL annual average solar radiation, kWh/m²/day = peak sun hours/day. */
  peak_sun_hours_day: z.number().nonnegative().optional(),
});
export type PvWattsEstimate = z.infer<typeof PvWattsEstimateSchema>;

export const PvWattsRequestSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  system_capacity_kw: z.number().positive().max(100).default(7),
  module_type: z
    .union([z.literal(0), z.literal(1), z.literal(2)])
    .default(0),
  array_type: z
    .union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ])
    .default(1),
  tilt: z.number().min(0).max(90).default(20),
  azimuth: z.number().min(0).max(360).default(180),
  losses_pct: z.number().min(0).max(99).default(14),
  /** Optional utility rate, $/kWh, used for annual-savings rollup. */
  utility_rate_usd_per_kwh: z.number().min(0).max(2).optional(),
});
export type PvWattsRequest = z.infer<typeof PvWattsRequestSchema>;
