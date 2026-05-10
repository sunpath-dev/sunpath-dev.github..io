import { z } from "zod";

/**
 * DSIRE-derived incentive program — normalized shape returned by
 * `incentives-fetch`. The federal ITC and a short list of state
 * programs are baked in as a fallback when DSIRE_API_KEY is not set
 * (POC-friendly); the same shape is used for live API responses.
 *
 * Source: https://programs.dsireusa.org/  (API access via signup)
 */
export const IncentiveSchema = z.object({
  /** Stable id within DSIRE, or a synthetic id like "fed:itc". */
  id: z.string().min(1),
  /** Display name. */
  name: z.string().min(1),
  /** "federal", state code (VA, TN, …), "utility", "local". */
  scope: z.enum(["federal", "state", "utility", "local"]),
  /** ISO state code, when applicable. */
  state: z.string().length(2).optional(),
  /** Free-form summary, ~1-2 sentences. */
  summary: z.string().min(1),
  /** Category such as "tax_credit", "rebate", "loan", "exemption". */
  kind: z.enum([
    "tax_credit",
    "rebate",
    "loan",
    "exemption",
    "performance_payment",
    "grant",
    "other",
  ]),
  /** Approximate maximum benefit, USD. Null when uncapped or unknown. */
  max_benefit_usd: z.number().nonnegative().nullable(),
  /** Percent benefit, 0-100, when applicable (e.g. ITC = 30). */
  benefit_pct: z.number().min(0).max(100).nullable(),
  /** Expiration date (ISO yyyy-mm-dd) if known. */
  expires_on: z.string().nullable(),
  /** Authoritative URL on the program. */
  source_url: z.string().url(),
});
export type Incentive = z.infer<typeof IncentiveSchema>;

export const IncentivesResponseSchema = z.object({
  state: z.string().length(2),
  fetched_at: z.string(),
  /** True when the response is from the static fallback rather than DSIRE. */
  is_fallback: z.boolean(),
  programs: z.array(IncentiveSchema),
});
export type IncentivesResponse = z.infer<typeof IncentivesResponseSchema>;

export const IncentivesRequestSchema = z.object({
  state: z.string().length(2),
  postal_code: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
});
export type IncentivesRequest = z.infer<typeof IncentivesRequestSchema>;
