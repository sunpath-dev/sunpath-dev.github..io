/**
 * Scott County, VA parcel adapter.
 * FIPS: state=51, county=169 (Scott County).
 *
 * Source strategy:
 *   Virginia publishes a statewide parcel layer through VGIN (Virginia
 *   Geographic Information Network). The exact FeatureServer URL has shifted
 *   over the years — most recently it has lived under
 *   `vginmaps.vdem.virginia.gov` / `vgin.vdem.virginia.gov`. Rather than hard-
 *   code a URL we may have to chase, the adapter accepts an `endpoint` override
 *   in the options, and exposes the field map it expects so the runner can
 *   verify against the live schema before a full run.
 *
 *   Fallback: a per-county static GeoJSON dump at `data/scott-va.geojson`.
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
 * Default VGIN statewide parcel layer URL. As of the latest published portal
 * directory; will be revalidated at ingest time. Override via constructor.
 */
const DEFAULT_VGIN_PARCELS_URL =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";

const META: ParcelAdapterMeta = {
  source: "VGIN statewide parcel layer (Scott County subset)",
  stateFips: "51",
  countyFips: "169",
  notes:
    "VGIN aggregates county parcels statewide. License: open data per the VGIN data sharing policy. Always re-verify the FeatureServer URL before a production run.",
};

/**
 * Field map from VGIN feature properties → Parcel. VGIN's column names are
 * fairly stable but vary slightly across counties and refresh cycles; this map
 * is the place to update if upstream renames a column.
 */
const FIELDS = {
  pin: ["PIN", "ParcelID", "PARCELID", "GPIN"],
  address: ["LocAddress", "SitusAddress", "ADDRESS", "PropertyAd"],
  city: ["LocCity", "SitusCity", "CITY"],
  zip: ["LocZip", "SitusZip", "ZIP"],
  county_fips: ["FIPS", "CountyFIPS", "COUNTY_FIPS"],
  acres: ["Acres", "ACREAGE"],
  year_built: ["YearBuilt", "YR_BUILT"],
  assessed: ["AssessedValue", "TotalValue", "ASMT_VAL"],
} as const;

function pick<T = unknown>(
  props: Record<string, unknown>,
  keys: readonly string[],
): T | undefined {
  for (const k of keys) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== "") {
      return props[k] as T;
    }
  }
  return undefined;
}

function centroidFromGeometry(
  geom: ArcGisFeature["geometry"],
): { type: "Point"; coordinates: [number, number] } | null {
  if (!geom) return null;
  if (geom.type === "Point") {
    const c = geom.coordinates as [number, number];
    return { type: "Point", coordinates: [c[0], c[1]] };
  }
  // For Polygon / MultiPolygon take the bounding-box midpoint — good enough
  // for map placement; PostGIS can recompute true centroid server-side later.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const visit = (p: unknown): void => {
    if (
      Array.isArray(p) &&
      typeof p[0] === "number" &&
      typeof p[1] === "number"
    ) {
      const [x, y] = p as [number, number];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return;
    }
    if (Array.isArray(p)) for (const c of p) visit(c);
  };
  visit(geom.coordinates);
  if (minX === Infinity) return null;
  return {
    type: "Point",
    coordinates: [(minX + maxX) / 2, (minY + maxY) / 2],
  };
}

function parsePostalCode(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  const m = /^(\d{5})(?:-?(\d{4}))?$/.exec(s);
  if (!m) return null;
  const five = m[1] ?? "";
  const four = m[2];
  return four ? `${five}-${four}` : five;
}

export interface ScottCountyAdapterOptions {
  /** Override the default VGIN FeatureServer URL. */
  endpoint?: string;
  /** ArcGIS where clause used to scope to Scott County (FIPS 169). */
  where?: string;
  /** Page size for the FeatureServer query. */
  pageSize?: number;
  fetcher?: typeof fetch;
}

export function createScottCountyVaAdapter(
  options: ScottCountyAdapterOptions = {},
): ParcelAdapter {
  const endpoint = options.endpoint ?? DEFAULT_VGIN_PARCELS_URL;
  const where = options.where ?? "FIPS = '51169' OR CountyFIPS = '51169'";

  return {
    meta: META,
    fetchAll() {
      return fetchArcGisFeatures({
        url: endpoint,
        where,
        pageSize: options.pageSize,
        fetcher: options.fetcher,
      });
    },
    normalize(raw: ParcelRaw): Parcel | null {
      const feature = raw as unknown as ArcGisFeature;
      const props = feature?.properties ?? {};
      const externalId = pick<string>(props, FIELDS.pin);
      if (!externalId) return null;
      const address = pick<string>(props, FIELDS.address);
      if (!address) return null;
      const city = pick<string>(props, FIELDS.city) ?? "Gate City";
      const postal = parsePostalCode(pick(props, FIELDS.zip));
      if (!postal) return null;
      const centroid = centroidFromGeometry(feature.geometry);
      if (!centroid) return null;
      const yearBuilt = pick<number>(props, FIELDS.year_built);
      const assessed = pick<number>(props, FIELDS.assessed);

      const candidate = {
        external_id: String(externalId),
        state_fips: "51",
        county_fips: "169",
        address_line1: String(address).trim(),
        city: String(city).trim(),
        state: "VA",
        postal_code: postal,
        centroid,
        year_built:
          typeof yearBuilt === "number" && Number.isFinite(yearBuilt)
            ? Math.trunc(yearBuilt)
            : undefined,
        assessed_value_usd:
          typeof assessed === "number" && assessed >= 0 ? assessed : undefined,
        has_existing_solar: false,
      };

      const parsed = ParcelSchema.safeParse(candidate);
      return parsed.success ? parsed.data : null;
    },
  };
}

/** Default-configured Scott County adapter. */
export const scottCountyVaAdapter = createScottCountyVaAdapter();
