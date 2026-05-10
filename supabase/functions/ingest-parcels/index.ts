// ingest-parcels — Supabase Edge Function (cron, daily).
//
// Incremental parcel upsert from VGIN's statewide ArcGIS FeatureServer
// for Scott County, VA (FIPS 51169). Mirrors the field map used by the
// `parcel-adapters/virginia/scott.ts` adapter (CLI version), but runs
// in a Deno edge function so it can be cron-scheduled without a CI
// runner.
//
// For full county loads, prefer `pnpm ingest:parcels` from a runner
// (no 60s wall-clock cap). This edge fn is for *incremental* daily
// re-syncs — bounded by `MAX_FEATURES` per run.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_VGIN_URL =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Parcels/FeatureServer/0";
const PAGE_SIZE = 500;
const MAX_FEATURES = 5000; // daily incremental cap

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    rings?: number[][][];
    x?: number;
    y?: number;
  };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

const FIELDS = {
  pin: ["PIN", "ParcelID", "PARCELID", "GPIN"],
  address: ["LocAddress", "SitusAddress", "ADDRESS", "PropertyAd"],
  city: ["LocCity", "SitusCity", "CITY"],
  zip: ["LocZip", "SitusZip", "ZIP"],
  acres: ["Acres", "ACREAGE"],
  year_built: ["YearBuilt", "YR_BUILT"],
  assessed: ["AssessedValue", "TotalValue", "ASMT_VAL"],
} as const;

function pick<T = unknown>(
  attrs: Record<string, unknown>,
  keys: readonly string[],
): T | undefined {
  for (const k of keys) {
    const v = attrs[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function bboxCentroidFromRings(
  rings: number[][][] | undefined,
): [number, number] | null {
  if (!rings || rings.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const pt of ring) {
      const x = pt[0];
      const y = pt[1];
      if (typeof x !== "number" || typeof y !== "number") continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return null;
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function parseZip(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const m = /^(\d{5})(?:-?(\d{4}))?$/.exec(String(raw).trim());
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2]}` : (m[1] ?? null);
}

interface ParcelRow {
  external_id: string;
  state_fips: string;
  county_fips: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  centroid: string;
  year_built: number | null;
  assessed_value_usd: number | null;
  has_existing_solar: boolean;
}

function normalize(f: ArcGisFeature): ParcelRow | null {
  const a = f.attributes ?? {};
  const externalId = pick<string | number>(a, FIELDS.pin);
  if (!externalId) return null;
  const address = pick<string>(a, FIELDS.address);
  if (!address) return null;
  const zip = parseZip(pick(a, FIELDS.zip));
  if (!zip) return null;
  const centroid = bboxCentroidFromRings(f.geometry?.rings)
    ?? (typeof f.geometry?.x === "number" && typeof f.geometry?.y === "number"
      ? [f.geometry.x, f.geometry.y]
      : null);
  if (!centroid) return null;
  const yearBuilt = pick<number>(a, FIELDS.year_built);
  const assessed = pick<number>(a, FIELDS.assessed);
  return {
    external_id: String(externalId),
    state_fips: "51",
    county_fips: "169",
    address_line1: String(address).trim(),
    city: String(pick<string>(a, FIELDS.city) ?? "Gate City").trim(),
    state: "VA",
    postal_code: zip,
    centroid: `SRID=4326;POINT(${centroid[0]} ${centroid[1]})`,
    year_built:
      typeof yearBuilt === "number" && Number.isFinite(yearBuilt)
        ? Math.trunc(yearBuilt)
        : null,
    assessed_value_usd:
      typeof assessed === "number" && assessed >= 0 ? assessed : null,
    has_existing_solar: false,
  };
}

async function fetchPage(
  endpoint: string,
  where: string,
  offset: number,
): Promise<ArcGisResponse> {
  const params = new URLSearchParams({
    where,
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultOffset: String(offset),
    resultRecordCount: String(PAGE_SIZE),
  });
  const res = await fetch(`${endpoint}/query?${params.toString()}`);
  if (!res.ok) throw new Error(`arcgis ${res.status}`);
  return res.json() as Promise<ArcGisResponse>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "missing supabase env" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  const endpoint = Deno.env.get("VGIN_PARCELS_URL") ?? DEFAULT_VGIN_URL;
  const where = "FIPS = '51169' OR CountyFIPS = '51169'";

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };

  let seen = 0;
  let upserted = 0;
  let offset = 0;
  let exceeded = true;
  while (exceeded && seen < MAX_FEATURES) {
    const resp = await fetchPage(endpoint, where, offset);
    if (resp.error) {
      return Response.json(
        { error: "arcgis", details: resp.error, upserted },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    const features = resp.features ?? [];
    seen += features.length;
    const rows: ParcelRow[] = [];
    for (const f of features) {
      const r = normalize(f);
      if (r) rows.push(r);
    }
    if (rows.length > 0) {
      const upsertRes = await fetch(
        `${supabaseUrl}/rest/v1/parcel?on_conflict=state_fips,county_fips,external_id`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(rows),
        },
      );
      if (!upsertRes.ok) {
        return Response.json(
          {
            error: "upsert failed",
            status: upsertRes.status,
            body: await upsertRes.text(),
            upserted,
          },
          { status: 502, headers: CORS_HEADERS },
        );
      }
      upserted += rows.length;
    }
    exceeded = Boolean(resp.exceededTransferLimit) && features.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  return Response.json(
    { ok: true, seen, upserted, capped: seen >= MAX_FEATURES },
    { headers: CORS_HEADERS },
  );
});
