// pvwatts-fetch — Supabase Edge Function
//
// Wraps NREL PVWatts v8. Browser sends {lat, lon, system_capacity_kw, ...};
// we add the API key server-side (NREL_API_KEY env var) and reshape the
// response into PvWattsEstimateSchema (see packages/shared/src/schemas/pvwatts.ts).
//
// Source: https://developer.nrel.gov/docs/solar/pvwatts/v8/
// Free with API key signup at https://developer.nrel.gov/signup/.

// deno-lint-ignore-file no-explicit-any

const PVW_BASE = "https://developer.nrel.gov/api/pvwatts/v8.json";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  lat: number;
  lon: number;
  system_capacity_kw?: number;
  module_type?: 0 | 1 | 2;
  array_type?: 0 | 1 | 2 | 3 | 4;
  tilt?: number;
  azimuth?: number;
  losses_pct?: number;
  utility_rate_usd_per_kwh?: number;
  /** When set, write the result to property_signal for caching. */
  parcel_id?: string;
}

function defaults(body: RequestBody) {
  return {
    system_capacity_kw: body.system_capacity_kw ?? 7,
    module_type: body.module_type ?? 0,
    array_type: body.array_type ?? 1,
    tilt: body.tilt ?? 20,
    azimuth: body.azimuth ?? 180,
    losses_pct: body.losses_pct ?? 14,
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

  const apiKey = Deno.env.get("NREL_API_KEY");
  if (!apiKey) {
    return Response.json(
      { error: "NREL_API_KEY not configured" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
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

  const d = defaults(body);
  const params = new URLSearchParams({
    api_key: apiKey,
    lat: String(body.lat),
    lon: String(body.lon),
    system_capacity: String(d.system_capacity_kw),
    module_type: String(d.module_type),
    array_type: String(d.array_type),
    tilt: String(d.tilt),
    azimuth: String(d.azimuth),
    losses: String(d.losses_pct),
    timeframe: "monthly",
    dataset: "nsrdb",
  });

  let raw: any;
  try {
    const res = await fetch(`${PVW_BASE}?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `pvwatts ${res.status}`, detail: text.slice(0, 500) },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    raw = await res.json();
  } catch (err) {
    return Response.json(
      { error: "pvwatts fetch failed", detail: String(err) },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  if (raw.errors && raw.errors.length > 0) {
    return Response.json(
      { error: "pvwatts validation", detail: raw.errors },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const out = raw.outputs ?? {};
  const acAnnual = Number(out.ac_annual ?? 0);
  const acMonthly: number[] = Array.isArray(out.ac_monthly)
    ? (out.ac_monthly as number[]).map((n) => Number(n))
    : new Array(12).fill(0);
  const dcAnnual = Number(out.dc_annual ?? 0);
  const capacityFactor = Number(out.capacity_factor ?? 0) / 100;

  const rate = body.utility_rate_usd_per_kwh ?? null;
  const savings = rate !== null ? acAnnual * rate : null;

  const payload = {
    inputs: {
      lat: body.lat,
      lon: body.lon,
      system_capacity_kw: d.system_capacity_kw,
      module_type: d.module_type,
      array_type: d.array_type,
      tilt: d.tilt,
      azimuth: d.azimuth,
      losses_pct: d.losses_pct,
    },
    ac_annual_kwh: acAnnual,
    ac_monthly_kwh:
      acMonthly.length === 12 ? acMonthly : new Array(12).fill(0),
    dc_annual_kwh: dcAnnual,
    capacity_factor: Math.max(0, Math.min(1, capacityFactor)),
    est_annual_savings_usd: savings,
  };

  // Persist to property_signal so doorcards / scoring can read it later.
  if (body.parcel_id) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/property_signal`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            parcel_id: body.parcel_id,
            kind: "pvwatts",
            observed_at: new Date().toISOString(),
            payload,
            source: "nrel-pvwatts-v8",
          }),
        });
      } catch {
        // best-effort cache; never fail the user-facing call
      }
    }
  }

  return Response.json(payload, { headers: CORS_HEADERS });
});
