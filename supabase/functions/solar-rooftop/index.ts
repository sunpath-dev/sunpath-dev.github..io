// solar-rooftop — Supabase Edge Function
//
// Returns roof analysis for a parcel.
//
// Data sources (in priority order):
//   1. Google Solar API  — if GOOGLE_SOLAR_API_KEY is set in Supabase secrets.
//      https://developers.google.com/maps/documentation/solar/overview
//      Free tier (billing required): 100 requests/day. Accurate per-segment
//      pitch, area, and annual sun-hours per panel.
//   2. OSM Overpass      — building footprint polygon → estimated roof area.
//      https://overpass-api.de  (free, no key, polite User-Agent required)
//      Estimates viable_area_sqft from footprint, conservative south_facing=true.
//
// Returns: { south_facing, viable_area_sqft, max_kw, panel_count, source }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PANEL_W = 400; // 400 W per panel (standard residential)
const COVERAGE = 0.65; // ~65 % of footprint is viable panel area (avg residential)
const W_PER_SQFT = 15; // ≈ 400 W / 26.7 sqft (standard residential density)
const UA = "(sunpath.dev, hello@sunpath.dev)";

interface RooftopResult {
  south_facing: boolean;
  viable_area_sqft: number;
  max_kw: number;
  panel_count: number;
  source: "google-solar" | "osm-overpass";
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Area of a lat/lon polygon in m² using the Shoelace formula. */
function polygonAreaM2(coords: { lat: number; lon: number }[]): number {
  const n = coords.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coords[i].lon * coords[j].lat;
    area -= coords[j].lon * coords[i].lat;
  }
  const area_deg2 = Math.abs(area) / 2;
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / n;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((avgLat * Math.PI) / 180);
  return area_deg2 * mPerDegLat * mPerDegLon;
}

// ---------------------------------------------------------------------------
// Google Solar API
// ---------------------------------------------------------------------------

async function fromGoogleSolar(
  lat: number,
  lon: number,
  apiKey: string,
): Promise<RooftopResult | null> {
  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lon}` +
    `&requiredQuality=LOW&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    // deno-lint-ignore no-explicit-any
    const data: any = await res.json();
    const sp = data?.solarPotential;
    if (!sp) return null;

    const area_m2: number = sp.maxArrayAreaMeters2 ?? 0;
    const viable_area_sqft = Math.round(area_m2 * 10.764);
    const panel_count: number = sp.maxArrayPanelsCount ?? 0;
    const panel_w: number = sp.panelCapacityWatts ?? PANEL_W;
    const max_kw = Math.round((panel_count * panel_w) / 100) / 10;

    // Determine south-facing from roof segments (azimuth 120°–240°).
    // deno-lint-ignore no-explicit-any
    const segments: any[] = sp.roofSegmentStats ?? [];
    const south_facing =
      segments.length === 0 ||
      segments.some((s) => {
        const az: number = s.azimuthDegrees ?? 180;
        return Math.abs(az - 180) <= 60;
      });

    return { south_facing, viable_area_sqft, max_kw, panel_count, source: "google-solar" };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// OSM Overpass — building footprint fallback
// ---------------------------------------------------------------------------

async function fromOverpass(
  lat: number,
  lon: number,
): Promise<RooftopResult | null> {
  const d = 0.0003; // ~33 m bounding box around the point
  const query =
    `[out:json][timeout:10];\n` +
    `(\n` +
    `  way[building](${lat - d},${lon - d},${lat + d},${lon + d});\n` +
    `);\n` +
    `out geom;`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return null;

    // deno-lint-ignore no-explicit-any
    const data: { elements: any[] } = await res.json();
    if (!data.elements?.length) return null;

    // Filter to way elements with complete geometry
    // deno-lint-ignore no-explicit-any
    const ways = data.elements.filter(
      (e: any) =>
        e.type === "way" &&
        Array.isArray(e.geometry) &&
        e.geometry.length > 2,
    );
    if (!ways.length) return null;

    // Pick the nearest way by centroid distance
    // deno-lint-ignore no-explicit-any
    let best: any = ways[0];
    let bestDist = Infinity;
    for (const way of ways) {
      // deno-lint-ignore no-explicit-any
      const geom: { lat: number; lon: number }[] = way.geometry;
      const avgLat = geom.reduce((s, c) => s + c.lat, 0) / geom.length;
      const avgLon = geom.reduce((s, c) => s + c.lon, 0) / geom.length;
      const dist = (avgLat - lat) ** 2 + (avgLon - lon) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = way;
      }
    }

    const geom: { lat: number; lon: number }[] = best.geometry;
    const area_m2 = polygonAreaM2(geom);
    if (area_m2 < 20) return null; // sanity: < 20 m² is probably noise

    const area_sqft = area_m2 * 10.764;
    const viable_area_sqft = Math.round(area_sqft * COVERAGE);
    const max_kw = Math.round((viable_area_sqft * W_PER_SQFT) / 100) / 10;
    const panel_count = Math.floor((max_kw * 1_000) / PANEL_W);

    return {
      south_facing: true, // conservative default; Google Solar gives precise orientation
      viable_area_sqft,
      max_kw,
      panel_count,
      source: "osm-overpass",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: 405, headers: CORS });
  }

  let body: { lat: number; lon: number; parcel_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON", { status: 400, headers: CORS });
  }

  const { lat, lon } = body;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return new Response("lat and lon required", { status: 400, headers: CORS });
  }

  // 1 — Google Solar (if key configured)
  const googleKey = Deno.env.get("GOOGLE_SOLAR_API_KEY");
  if (googleKey) {
    const result = await fromGoogleSolar(lat, lon, googleKey);
    if (result) {
      return Response.json(result, { headers: CORS });
    }
  }

  // 2 — OSM Overpass fallback
  const result = await fromOverpass(lat, lon);
  if (result) {
    return Response.json(result, { headers: CORS });
  }

  // No building found at this location
  return Response.json(
    { error: "no_building_data" },
    { status: 404, headers: CORS },
  );
});
