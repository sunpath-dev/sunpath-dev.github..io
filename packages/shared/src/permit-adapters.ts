/**
 * PermitAdapter — local-government building permit feed interface.
 *
 * Each jurisdiction (Scott VA, Russell VA, etc.) implements this to expose
 * recent building/electrical permit pulls. The triggers-scan-permits Edge
 * Function calls each adapter on a cron, and writes a `trigger_event` row
 * with kind="permit_pulled" for any nearby permits that aren't yet in the DB.
 *
 * Hard rule: adapters MUST NOT be called from the browser. They run server-
 * side only (Edge Function or seeding scripts) so we can keep API keys off
 * the device and rate-limit responsibly.
 */

export interface PermitAdapterMeta {
  /** Human-readable source name, e.g. "Scott County, VA Building Permits" */
  source: string;
  /** State FIPS code, e.g. "51" for Virginia */
  stateFips: string;
  /** County FIPS code, e.g. "169" for Scott County, VA */
  countyFips: string;
  /** Free-form notes — license, attribution, gotchas */
  notes?: string;
}

/** Normalized permit shape the trigger scanner writes to the DB. */
export interface PermitRecord {
  /** Stable upstream permit number — used for de-duplication */
  upstream_id: string;
  /** Permit category — e.g. "electrical", "solar", "addition", "roof". */
  kind: string;
  /** Date the permit was issued (ISO date, no time). */
  issued_on: string;
  /** Best-effort street address as printed on the permit. */
  address_line1?: string;
  /** Latitude/longitude if the source provides it. */
  geo_lat?: number;
  /** Longitude */
  geo_lon?: number;
  /** Free-form description from the permit. */
  description?: string;
  /** Anything else the source provides — passed through to trigger payload. */
  raw: Record<string, unknown>;
}

export type PermitRaw = Record<string, unknown>;

export interface PermitAdapter {
  readonly meta: PermitAdapterMeta;

  /**
   * Fetch permits issued on or after `since` (ISO date). Adapters should
   * respect upstream rate limits and return empty when nothing is new.
   */
  fetchSince(since: string): Promise<PermitRecord[]>;
}
