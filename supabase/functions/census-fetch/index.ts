// census-fetch — Supabase Edge Function
//
// Wraps the U.S. Census ACS 5-year API. Returns owner-occupancy %,
// median household income, and median home value for a county (or
// tract). Used to enrich the parcel-area context for scoring + the
// rep talking-points panel. Free with API key (CENSUS_API_KEY).
//
// Source: https://www.census.gov/data/developers/data-sets/acs-5year.html

// deno-lint-ignore-file no-explicit-any

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VINTAGE = 2022; // most recent ACS 5-year as of 2026.

interface RequestBody {
  state_fips: string;
  county_fips: string;
  tract?: string;
}

// ACS variables we care about:
//   B25003_001E  — total occupied housing units
//   B25003_002E  — owner occupied
//   B19013_001E  — median household income
//   B25077_001E  — median home value
const VARS = "B25003_001E,B25003_002E,B19013_001E,B25077_001E";

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

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json(
      { error: "invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  if (
    typeof body.state_fips !== "string" ||
    body.state_fips.length !== 2 ||
    typeof body.county_fips !== "string" ||
    body.county_fips.length !== 3
  ) {
    return Response.json(
      { error: "state_fips (2) and county_fips (3) are required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const apiKey = Deno.env.get("CENSUS_API_KEY") ?? "";
  const params = new URLSearchParams({
    get: VARS,
    for: body.tract
      ? `tract:${body.tract}`
      : `county:${body.county_fips}`,
    in: body.tract
      ? `state:${body.state_fips} county:${body.county_fips}`
      : `state:${body.state_fips}`,
  });
  if (apiKey) params.set("key", apiKey);

  const url = `https://api.census.gov/data/${VINTAGE}/acs/acs5?${params.toString()}`;

  let raw: any;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `census ${res.status}`, detail: text.slice(0, 500) },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    raw = await res.json();
  } catch (err) {
    return Response.json(
      { error: "census fetch failed", detail: String(err) },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  // ACS API returns a 2D array: [headers, ...rows]
  if (!Array.isArray(raw) || raw.length < 2) {
    return Response.json(
      { error: "unexpected census shape" },
      { status: 502, headers: CORS_HEADERS },
    );
  }
  const headers: string[] = raw[0];
  const row: string[] = raw[1];
  const idx = (name: string) => headers.indexOf(name);

  const totalUnits = numOrNull(row[idx("B25003_001E")]);
  const ownerUnits = numOrNull(row[idx("B25003_002E")]);
  const ownerPct =
    totalUnits && ownerUnits && totalUnits > 0
      ? Math.round((ownerUnits / totalUnits) * 1000) / 10
      : null;

  const payload = {
    state_fips: body.state_fips,
    county_fips: body.county_fips,
    tract: body.tract ?? null,
    owner_occupied_pct: ownerPct,
    median_household_income_usd: numOrNull(row[idx("B19013_001E")]),
    median_home_value_usd: numOrNull(row[idx("B25077_001E")]),
    vintage: VINTAGE,
  };
  return Response.json(payload, { headers: CORS_HEADERS });
});

function numOrNull(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // Census uses negative sentinels (-666666666) for missing.
  if (n < 0) return null;
  return n;
}
