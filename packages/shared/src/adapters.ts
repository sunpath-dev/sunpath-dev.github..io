/**
 * ParcelAdapter — county-specific data importer interface.
 *
 * Each county (Scott VA, Russell VA, etc.) implements this interface to expose
 * its parcel-data feed in a normalized shape. Adapters live in
 * `parcel-adapters/<state>/<county>.ts`.
 *
 * Adapters MUST NOT call third-party APIs from the browser. They run inside
 * Supabase Edge Functions or the seeding scripts only.
 */

import type { Parcel } from "./schemas/parcel.js";

/**
 * Raw record straight from the source — shape varies wildly per county.
 * Adapters normalize this into `Parcel` via `normalize()`.
 */
export type ParcelRaw = Record<string, unknown>;

export interface ParcelAdapterMeta {
  /** Human-readable source name, e.g. "Scott County, VA Property Records" */
  source: string;
  /** State FIPS code, e.g. "51" for Virginia */
  stateFips: string;
  /** County FIPS code, e.g. "169" for Scott County, VA */
  countyFips: string;
  /** ISO timestamp of the last known refresh of the upstream dataset, if known */
  upstreamUpdatedAt?: string;
  /** Free-form notes — license, attribution, gotchas */
  notes?: string;
}

export interface ParcelAdapter {
  readonly meta: ParcelAdapterMeta;

  /** Stream raw parcel records from the upstream source. */
  fetchAll(): AsyncIterable<ParcelRaw>;

  /**
   * Normalize a single raw record. Return `null` if the record should be
   * skipped (e.g. non-residential, missing geometry).
   */
  normalize(raw: ParcelRaw): Parcel | null;
}
