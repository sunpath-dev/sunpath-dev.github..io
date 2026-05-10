import { z } from "zod";

/**
 * A signal attached to a single property — drives rewarm triggers and the
 * knock score.
 */
export const PropertySignalKindSchema = z.enum([
  "neighbor_permit", // a nearby parcel pulled a solar permit
  "rate_hike", // utility rate increased recently
  "recently_sold",
  "high_bill_estimate",
  "owner_occupancy_changed",
]);
export type PropertySignalKind = z.infer<typeof PropertySignalKindSchema>;

export const PropertySignalSchema = z.object({
  id: z.string().uuid().optional(),
  parcel_id: z.string().uuid(),
  kind: PropertySignalKindSchema,
  observed_at: z.string().datetime(),
  payload: z.record(z.unknown()).optional(), // kind-specific extra data
  source: z.string().min(1), // e.g. "scott-va-permits", "eia-v2"
});
export type PropertySignal = z.infer<typeof PropertySignalSchema>;
