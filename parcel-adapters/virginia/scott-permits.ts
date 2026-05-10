/**
 * Scott County, VA permits adapter — STUB.
 *
 * Scott County publishes building permits as a periodic PDF on its
 * website rather than a structured feed (verified May 2026). Until we
 * either (a) parse the PDF or (b) get a Socrata-style endpoint, this
 * adapter returns an empty list so the rest of the trigger pipeline can
 * be exercised end-to-end.
 *
 * When we wire up the real source, the contract will be:
 *   - Fetch the latest permit listing
 *   - Filter to issued_on >= since
 *   - De-dupe against trigger_event.payload->>'upstream_id'
 *   - Return PermitRecord[] with upstream_id stable across refreshes
 */

import type {
  PermitAdapter,
  PermitAdapterMeta,
  PermitRecord,
} from "@sunpath/shared";

const meta: PermitAdapterMeta = {
  source: "Scott County, VA Building Permits",
  stateFips: "51",
  countyFips: "169",
  notes:
    "Stub — upstream is a PDF on scottcountyva.com. Returns no records until parser is wired.",
};

export const scottCountyVaPermitsAdapter: PermitAdapter = {
  meta,
  async fetchSince(_since: string): Promise<PermitRecord[]> {
    return [];
  },
};
