// ingest-parcels — Supabase Edge Function (cron, daily).
//
// Incremental parcel upsert from VGIN's VA_Address_Points FeatureServer.
// Uses the same service and field mapping as parcel-adapters/virginia/scott.ts.
// Filtered to a specific county by FIPS (e.g. '51169' for Scott County, VA).
//
// For full county loads, prefer the ingest-parcels GitHub Actions workflow
// (no 60s wall-clock cap). This edge fn is for incremental daily re-syncs,
// bounded by MAX_FEATURES per run.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// VGIN statewide address-points layer — point geometry + full address per site.
const DEFAULT_VGIN_URL =
  "https://vginmaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Address_Points/FeatureServer/0";
const PAGE_SIZE = 500;
const MAX_FEATURES = 5000; // daily incremental cap

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: {
    x?: number;
    y?: number;
  };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

// Maps state FIPS → 2-letter abbreviation
const FIPS_STATE: Record<string, string> = { "51": "VA" };

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

interface RequestBody {
  state_fips?: string;
  county_fips?: string;
}

function formatZip(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n).padStart(5, "0");
}

function normalize(
  f: ArcGisFeature,
  stateFips: string,
  countyFips: string,
  stateAbbrev: string,
): ParcelRow | null {
  const a = f.attributes ?? {};

  const externalId = a["ADDPTKEY"];
  if (!externalId) return null;

  const fullAddr = a["FULLADDR"];
  if (!fullAddr || typeof fullAddr !== "string" || !fullAddr.trim()) return null;

  const zip = formatZip(a["ZIP_5"]);
  if (!zip) return null;

  // Address-points geometry is a Point (x/y directly on geometry object)
  const geom = f.geometry;
  if (
    !geom ||
    typeof geom.x !== "number" ||
    typeof geom.y !== "number" ||
    !isFinite(geom.x) ||
    !isFinite(geom.y)
  ) return null;

  const rawCity =
    (a["PO_NAME"] as string | undefined)?.trim() ||
    (a["MUNICIPALITY"] as string | undefined)?.trim() ||
    "Scott County";

  return {
    external_id: String(externalId),
    state_fips: stateFips,
    county_fips: countyFips,
    address_line1: fullAddr.trim(),
    city: rawCity || "Scott County",
    state: stateAbbrev,
    postal_code: zip,
    centroid: `SRID=4326;POINT(${geom.x} ${geom.y})`,
    year_built: null,
    assessed_value_usd: null,
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
    outFields: "ADDPTKEY,FULLADDR,PO_NAME,MUNICIPALITY,ZIP_5",
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

  let body: RequestBody = {};
  try { body = await req.json() as RequestBody; } catch { /* empty body is fine */ }
  const stateFips = (body.state_fips ?? "51").replace(/\D/g, "").padStart(2, "0").slice(0, 2);
  const countyFips = (body.county_fips ?? "169").replace(/\D/g, "").padStart(3, "0").slice(0, 3);
  const stateAbbrev = FIPS_STATE[stateFips] ?? "VA";
  const fipsFull = `${stateFips}${countyFips}`;
  const endpoint = Deno.env.get("VGIN_PARCELS_URL") ?? DEFAULT_VGIN_URL;
  const where = `FIPS = '${fipsFull}'`;

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
      const r = normalize(f, stateFips, countyFips, stateAbbrev);
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
    { ok: true, state_fips: stateFips, county_fips: countyFips, seen, upserted, capped: seen >= MAX_FEATURES },
    { headers: CORS_HEADERS },
  );
});
