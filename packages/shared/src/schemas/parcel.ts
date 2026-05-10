import { z } from "zod";

/**
 * Cardinal/intercardinal orientation a roof face points toward.
 * `unknown` means we couldn't determine it from footprint data.
 */
export const OrientationSchema = z.enum([
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
  "unknown",
]);
export type Orientation = z.infer<typeof OrientationSchema>;

/**
 * Parcel — normalized shape used across the app and DB.
 * County-specific adapters produce these.
 */
export const ParcelSchema = z.object({
  // Identity
  id: z.string().uuid().optional(), // assigned by DB on insert
  external_id: z.string().min(1), // upstream parcel/PIN/APN
  state_fips: z.string().regex(/^\d{2}$/),
  county_fips: z.string().regex(/^\d{3}$/),

  // Address
  address_line1: z.string().min(1),
  address_line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  postal_code: z.string().regex(/^\d{5}(-\d{4})?$/),

  // Geometry — GeoJSON, projected to EPSG:4326
  centroid: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]), // [lon, lat]
  }),
  footprint: z
    .object({
      type: z.literal("Polygon"),
      coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
    })
    .optional(),

  // Roof / building
  roof_area_sqft: z.number().positive().optional(),
  primary_orientation: OrientationSchema.default("unknown"),
  year_built: z.number().int().min(1800).max(2100).optional(),

  // Owner / valuation (where available — many counties don't expose this)
  owner_occupied: z.boolean().optional(),
  owner_name_redacted: z.string().optional(), // never store full owner names client-side
  assessed_value_usd: z.number().nonnegative().optional(),

  // Solar signals
  has_existing_solar: z.boolean().default(false),

  // Lifecycle
  source_updated_at: z.string().datetime().optional(),
});
export type Parcel = z.infer<typeof ParcelSchema>;
