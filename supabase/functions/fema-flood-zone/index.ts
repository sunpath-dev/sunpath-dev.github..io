// fema-flood-zone — Supabase Edge Function
//
// Queries the FEMA National Flood Hazard Layer (NFHL) for the flood zone
// designation at a given lat/lon point. Free, no API key required.
//
// Source: https://msc.fema.gov/portal/home
// NFHL MapServer layer 28 = flood hazard zones

const FEMA_URL =
  "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  let body: { lat: number; lon: number };
  try {
    body = (await req.json()) as { lat: number; lon: number };
  } catch {
    return Response.json(
      { error: "invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (typeof body.lat !== "number" || typeof body.lon !== "number") {
    return Response.json(
      { error: "lat and lon are required numbers" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: body.lon, y: body.lat }),
    geometryType: "esriGeometryPoint",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FLD_ZONE,FLD_AR_ID,SFHA_TF",
    f: "json",
    inSR: "4326",
    outSR: "4326",
    returnGeometry: "false",
  });

  let raw: unknown;
  try {
    const res = await fetch(`${FEMA_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // Return a safe default rather than propagating FEMA outages.
      return Response.json(
        { zone: "X", sfha: false, label: "X — Minimal flood risk (FEMA unavailable)" },
        { status: 200, headers: CORS_HEADERS },
      );
    }
    raw = await res.json();
  } catch {
    return Response.json(
      { zone: "X", sfha: false, label: "X — Minimal flood risk (FEMA unavailable)" },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const features = (raw as Record<string, unknown>)["features"];
  if (!Array.isArray(features) || features.length === 0) {
    // Outside NFHL coverage or no flood zone mapped — treat as X (minimal).
    return Response.json(
      { zone: "X", sfha: false, label: "X — Minimal flood risk (not mapped)" },
      { status: 200, headers: CORS_HEADERS },
    );
  }

  const attrs =
    ((features[0] as Record<string, unknown>)["attributes"] as Record<string, unknown>) ??
    {};
  const zone = String(attrs["FLD_ZONE"] ?? "X");
  const sfha = attrs["SFHA_TF"] === "T";

  return Response.json(
    { zone, sfha, label: zoneLabel(zone, sfha) },
    { status: 200, headers: CORS_HEADERS },
  );
});

function zoneLabel(zone: string, sfha: boolean): string {
  if (sfha) {
    const z = zone.toUpperCase();
    if (z === "AE" || z.startsWith("AE"))
      return `${zone} — High flood risk (1% annual chance, base elevation established)`;
    if (z === "A")
      return `${zone} — High flood risk (1% annual chance, no base elevation)`;
    if (z.startsWith("AO"))
      return `${zone} — Shallow sheet flooding (avg depth 1–3 ft)`;
    if (z.startsWith("AH"))
      return `${zone} — Shallow ponding (avg depth 1–3 ft)`;
    if (z.startsWith("AV") || z.startsWith("VE") || z === "V")
      return `${zone} — Coastal high-hazard area`;
    return `${zone} — Special Flood Hazard Area (SFHA)`;
  }
  const zu = zone.toUpperCase();
  if (zu === "X" || zu === "B" || zu === "C")
    return `${zone} — Minimal flood risk (outside 500-yr floodplain)`;
  if (zu === "D")
    return `${zone} — Possible flood hazard (not fully studied)`;
  return zone;
}
