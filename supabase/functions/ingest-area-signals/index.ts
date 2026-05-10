// ingest-area-signals — Supabase Edge Function (cron, monthly)
//
// For each unique (state_fips, county_fips) currently represented in
// public.parcel, fetches ACS 5-year demographics via the local
// `census-fetch` function and upserts an `area_signal` row scoped to a
// rough county bounding-box polygon.
//
// PostGIS-perfect county polygons are deferred (TIGER shapefiles are
// 100s of MB); for now we use the bounding-box of the parcels we
// actually have for that county. That's good enough to attach signals
// to map queries.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CountyRow {
  state_fips: string;
  county_fips: string;
  minlon: number;
  minlat: number;
  maxlon: number;
  maxlat: number;
}

interface CensusPayload {
  state_fips: string;
  county_fips: string;
  owner_occupied_pct: number | null;
  median_household_income_usd: number | null;
  median_home_value_usd: number | null;
  vintage: number;
}

function bboxPolygonGeoJson(c: CountyRow) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [c.minlon, c.minlat],
        [c.maxlon, c.minlat],
        [c.maxlon, c.maxlat],
        [c.minlon, c.maxlat],
        [c.minlon, c.minlat],
      ],
    ],
  };
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
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Distinct county tuples in our parcel table, with bbox extents. We
  // do this via a lightweight RPC if available, otherwise fall back to
  // a paginated scan. To keep this function self-contained we just
  // call PostgREST with a horizon limit; a future migration can add a
  // SQL view for cleaner aggregation.
  const parcelRes = await fetch(
    `${supabaseUrl}/rest/v1/parcel?select=state_fips,county_fips,centroid&limit=10000`,
    { headers },
  );
  if (!parcelRes.ok) {
    return Response.json(
      { error: "parcel scan failed", status: parcelRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  type ParcelLite = {
    state_fips: string;
    county_fips: string;
    centroid: { type: "Point"; coordinates: [number, number] } | string;
  };
  const parcels = (await parcelRes.json()) as ParcelLite[];

  const countyMap = new Map<string, CountyRow>();
  for (const p of parcels) {
    let lon: number | null = null;
    let lat: number | null = null;
    if (typeof p.centroid === "object" && p.centroid !== null) {
      [lon, lat] = p.centroid.coordinates;
    }
    if (lon === null || lat === null || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      continue;
    }
    const key = `${p.state_fips}-${p.county_fips}`;
    const prev = countyMap.get(key);
    if (!prev) {
      countyMap.set(key, {
        state_fips: p.state_fips,
        county_fips: p.county_fips,
        minlon: lon,
        maxlon: lon,
        minlat: lat,
        maxlat: lat,
      });
    } else {
      if (lon < prev.minlon) prev.minlon = lon;
      if (lon > prev.maxlon) prev.maxlon = lon;
      if (lat < prev.minlat) prev.minlat = lat;
      if (lat > prev.maxlat) prev.maxlat = lat;
    }
  }

  let updated = 0;
  const errors: { county: string; status?: number; error?: string }[] = [];
  for (const c of countyMap.values()) {
    // Pad bbox so a flat county doesn't degenerate into a line.
    if (c.maxlon - c.minlon < 0.01) c.maxlon = c.minlon + 0.01;
    if (c.maxlat - c.minlat < 0.01) c.maxlat = c.minlat + 0.01;

    const censusRes = await fetch(
      `${supabaseUrl}/functions/v1/census-fetch`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          state_fips: c.state_fips,
          county_fips: c.county_fips,
        }),
      },
    );
    if (!censusRes.ok) {
      errors.push({
        county: `${c.state_fips}-${c.county_fips}`,
        status: censusRes.status,
      });
      continue;
    }
    const payload = (await censusRes.json()) as CensusPayload;

    const insertRes = await fetch(
      `${supabaseUrl}/rest/v1/area_signal`,
      {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          scope: bboxPolygonGeoJson(c),
          kind: "acs5_county",
          observed_at: new Date().toISOString(),
          payload,
          source: `acs5-${payload.vintage}`,
        }),
      },
    );
    if (!insertRes.ok) {
      errors.push({
        county: `${c.state_fips}-${c.county_fips}`,
        status: insertRes.status,
      });
      continue;
    }
    updated += 1;
  }

  return Response.json(
    { ok: true, counties: countyMap.size, updated, errors },
    { headers: CORS_HEADERS },
  );
});
