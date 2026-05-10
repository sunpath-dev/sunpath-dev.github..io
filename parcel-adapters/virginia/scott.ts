/**
 * Scott County, VA parcel adapter.
 * FIPS: state=51, county=169.
 *
 * STATUS: stub. The exact upstream endpoint for Scott County parcel data has
 * not been confirmed yet. Likely candidates:
 *   - VGIN (Virginia Geographic Information Network) statewide parcel layer:
 *     https://vgin.vdem.virginia.gov/
 *   - Scott County GIS / Commissioner of the Revenue records (manual export)
 *
 * TODO before this is real:
 *   1. Confirm authoritative parcel source (ArcGIS REST? static export?).
 *   2. Confirm license / redistribution terms.
 *   3. Map upstream fields to the Parcel schema.
 *   4. Decide refresh cadence (quarterly? annual?).
 */

import {
  type Parcel,
  type ParcelAdapter,
  type ParcelAdapterMeta,
  type ParcelRaw,
  ParcelSchema,
} from "@sunpath/shared";

const META: ParcelAdapterMeta = {
  source: "Scott County, VA parcel records (TBD upstream)",
  stateFips: "51",
  countyFips: "169",
  notes:
    "Stub — upstream endpoint not yet wired. See parcel-adapters/README.md.",
};

async function* emptyStream(): AsyncIterable<ParcelRaw> {
  // Intentionally empty until the upstream is wired.
}

export const scottCountyVaAdapter: ParcelAdapter = {
  meta: META,

  fetchAll(): AsyncIterable<ParcelRaw> {
    return emptyStream();
  },

  normalize(_raw: ParcelRaw): Parcel | null {
    // Once upstream is wired, map fields here, then validate via:
    //   return ParcelSchema.parse(mapped);
    void ParcelSchema;
    return null;
  },
};
