/**
 * Scott County, VA parcel adapter.
 * FIPS: state=51, county=169 (Scott County).
 *
 * Source strategy:
 *   The VGIN VA_Parcels statewide layer has geometry only (no addresses, no
 *   assessed values). Instead we use the VGIN VA_Address_Points layer, which
 *   carries FULLADDR + PO_NAME + ZIP_5 + Point geometry for every addressed
 *   location in Virginia, including all 14k+ Scott County sites.
 *
 *   Assessed values / year-built come from a county CAMA extract (separate step).
 *
 * NEVER call this from the browser — adapters run inside the seeding script
 * (`scripts/ingest-parcels.ts`) and Edge Functions only. (See design §6.)
 */

import {
  type Parcel,
  type ParcelAdapter,
  type ParcelAdapterMeta,
  type ParcelRaw,
  ParcelSchema,
} from "@sunpath/shared";
import { fetchArcGisFeatures, type ArcGisFeature } from "../src/arcgis.js";

/**
 * VGIN statewide address-points layer. Point geometry + full address per site.
 * Filter to Scott County via FIPS = '51169'.
 */
const DEFAULT_VGIN_ADDRESSES_URL =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Address_Points/FeatureServer/0";

const META: ParcelAdapterMeta = {
  source: "VGIN VA_Address_Points (Scott County, FIPS 51169)",
  stateFips: "51",
  countyFips: "169",
  notes:
    "VGIN address-point layer: ~14k addressed locations with Point geometry, " +
    "FULLADDR, PO_NAME, ZIP_5. No assessed-value or year-built — those require " +
    "a separate CAMA extract from the Scott County Commissioner of the Revenue.",
};

function formatZip(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n).padStart(5, "0");
}

export interface ScottCountyAdapterOptions {
  /** Override the default VGIN FeatureServer URL. */
  endpoint?: string;
  /** Page size for the FeatureServer query. */
  pageSize?: number;
  fetcher?: typeof fetch;
}

export function createScottCountyVaAdapter(
  options: ScottCountyAdapterOptions = {},
): ParcelAdapter {
  const endpoint = options.endpoint ?? DEFAULT_VGIN_ADDRESSES_URL;

  return {
    meta: META,
    fetchAll() {
      return fetchArcGisFeatures({
        url: endpoint,
        where: "FIPS = '51169'",
        pageSize: options.pageSize,
        fetcher: options.fetcher,
      });
    },
    normalize(raw: ParcelRaw): Parcel | null {
      const feature = raw as unknown as ArcGisFeature;
      const props = feature?.properties ?? {};

      const externalId = props["ADDPTKEY"];
      if (!externalId) return null;

      const fullAddr = props["FULLADDR"];
      if (!fullAddr || typeof fullAddr !== "string" || !fullAddr.trim()) return null;

      // PO_NAME is the post-office city; fall back to MUNICIPALITY, then county name.
      const rawCity =
        (props["PO_NAME"] as string | undefined)?.trim() ||
        (props["MUNICIPALITY"] as string | undefined)?.trim() ||
        "Scott County";
      const city = rawCity || "Scott County";

      const postal = formatZip(props["ZIP_5"]);
      if (!postal) return null;

      // Address-points geometry is already a Point.
      const geom = feature.geometry;
      if (!geom || geom.type !== "Point") return null;
      const [lon, lat] = geom.coordinates as [number, number];
      if (!isFinite(lon) || !isFinite(lat)) return null;

      const candidate = {
        external_id: String(externalId),
        state_fips: "51",
        county_fips: "169",
        address_line1: fullAddr.trim(),
        city,
        state: "VA",
        postal_code: postal,
        centroid: { type: "Point" as const, coordinates: [lon, lat] as [number, number] },
        has_existing_solar: false,
      };

      const parsed = ParcelSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    },
  };
}

/** Default-configured Scott County adapter. */
export const scottCountyVaAdapter = createScottCountyVaAdapter();
