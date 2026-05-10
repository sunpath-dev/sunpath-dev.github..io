import { z } from "zod";

/** Census ACS 5-year context returned by the `census-fetch` Edge Function. */
export const CensusContextSchema = z.object({
  state_fips: z.string().length(2),
  county_fips: z.string().length(3),
  /** Census tract code, when resolved. */
  tract: z.string().nullable(),
  /** % owner-occupied housing units (0-100). */
  owner_occupied_pct: z.number().min(0).max(100).nullable(),
  /** Median household income, USD. */
  median_household_income_usd: z.number().nonnegative().nullable(),
  /** Median home value, USD. */
  median_home_value_usd: z.number().nonnegative().nullable(),
  /** ACS data vintage (e.g. 2022). */
  vintage: z.number().int(),
});
export type CensusContext = z.infer<typeof CensusContextSchema>;

export const CensusRequestSchema = z.object({
  state_fips: z.string().length(2),
  county_fips: z.string().length(3),
  tract: z.string().optional(),
});
export type CensusRequest = z.infer<typeof CensusRequestSchema>;
