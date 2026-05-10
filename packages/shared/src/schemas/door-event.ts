import { z } from "zod";

/**
 * Door event — what happened when the rep walked up to a door.
 * One row per knock attempt.
 */
export const DoorEventOutcomeSchema = z.enum([
  "no_answer",
  "not_interested",
  "callback_requested",
  "appointment_set",
  "do_not_knock",
  "language_barrier",
  "renter",
  "qualified_lead",
]);
export type DoorEventOutcome = z.infer<typeof DoorEventOutcomeSchema>;

export const DoorEventSchema = z.object({
  id: z.string().uuid().optional(),
  parcel_id: z.string().uuid(),
  rep_id: z.string().uuid(),

  occurred_at: z.string().datetime(),
  outcome: DoorEventOutcomeSchema,

  notes: z.string().max(2000).optional(),

  // Capture coords at the door — useful for territory-walked heatmaps
  geo_lat: z.number().min(-90).max(90).optional(),
  geo_lon: z.number().min(-180).max(180).optional(),

  // Sync metadata — door events are written offline and replayed
  client_event_id: z.string().uuid(), // dedup key from the device
});
export type DoorEvent = z.infer<typeof DoorEventSchema>;
