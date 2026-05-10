import { z } from "zod";

export const LeadStageSchema = z.enum([
  "new",
  "contacted",
  "appointment_set",
  "appointment_held",
  "quote_sent",
  "signed",
  "installed",
  "lost",
]);
export type LeadStage = z.infer<typeof LeadStageSchema>;

export const LeadSchema = z.object({
  id: z.string().uuid().optional(),
  parcel_id: z.string().uuid(),
  rep_id: z.string().uuid(),

  stage: LeadStageSchema.default("new"),

  // PII — must be encrypted at rest in production hardening (Phase pre-launch).
  contact_name: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional(),

  next_action_at: z.string().datetime().optional(),
  notes: z.string().max(4000).optional(),

  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});
export type Lead = z.infer<typeof LeadSchema>;
