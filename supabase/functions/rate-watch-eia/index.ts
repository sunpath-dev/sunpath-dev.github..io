// rate-watch-eia — Supabase Edge Function (cron-invoked)
//
// Pulls the latest monthly residential electricity rate for each state
// the rep operates in (currently inferred by querying distinct
// parcel.state_fips values, mapped to the two-letter code) and upserts
// into utility_rate_observation. Server-side only; never call from the
// browser (key-bearing).
//
// EIA v2 series we use:
//   electricity/retail-sales (filter: sectorid=RES, stateid=<two-letter>)
//   - Returns price in cents per kWh by month per state-sector-utility.
// Docs: https://www.eia.gov/opendata/documentation.php (verified May 2026)
//
// We grab the last 12 months and upsert; the unique constraint on
// (sector, state, utility_id, period) keeps it idempotent.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Minimal FIPS->USPS mapping for the states we currently target.
// Extend as new markets light up.
const FIPS_TO_USPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

interface EiaRow {
  period: string;
  stateid: string;
  sectorid: string;
  price?: number; // cents/kWh
  utilityid?: string;
}

interface RequestBody {
  /** Override states (USPS codes). If omitted, derived from parcels. */
  states?: string[];
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
  const eiaKey = Deno.env.get("EIA_API_KEY");
  if (!supabaseUrl || !serviceKey) {
    return Response.json(
      { error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
  if (!eiaKey) {
    return Response.json(
      { error: "missing EIA_API_KEY" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  let body: RequestBody = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = (await req.json()) as RequestBody;
    }
  } catch {
    body = {};
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  // Resolve target states.
  let states: string[];
  if (body.states && body.states.length > 0) {
    states = body.states.map((s) => s.toUpperCase()).slice(0, 50);
  } else {
    const parcelStatesUrl = `${supabaseUrl}/rest/v1/parcel?select=state_fips&limit=1000`;
    const psRes = await fetch(parcelStatesUrl, { headers });
    if (!psRes.ok) {
      return Response.json(
        { error: "failed to list parcel states" },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    const rows = (await psRes.json()) as { state_fips: string }[];
    const fipsSet = new Set(rows.map((r) => r.state_fips).filter(Boolean));
    states = Array.from(fipsSet)
      .map((f) => FIPS_TO_USPS[f])
      .filter((s): s is string => !!s);
    if (states.length === 0) states = ["VA"]; // sensible default
  }

  // Last 12 months.
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  const startPeriod = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;

  let totalUpserted = 0;
  const errors: { state: string; error: string }[] = [];

  for (const state of states) {
    const eiaUrl = new URL(
      "https://api.eia.gov/v2/electricity/retail-sales/data/",
    );
    eiaUrl.searchParams.set("api_key", eiaKey);
    eiaUrl.searchParams.set("frequency", "monthly");
    eiaUrl.searchParams.append("data[]", "price");
    eiaUrl.searchParams.append("facets[stateid][]", state);
    eiaUrl.searchParams.append("facets[sectorid][]", "RES");
    eiaUrl.searchParams.set("start", startPeriod);
    eiaUrl.searchParams.set("sort[0][column]", "period");
    eiaUrl.searchParams.set("sort[0][direction]", "desc");
    eiaUrl.searchParams.set("offset", "0");
    eiaUrl.searchParams.set("length", "5000");

    let eiaRows: EiaRow[];
    try {
      const r = await fetch(eiaUrl.toString());
      if (!r.ok) {
        errors.push({ state, error: `EIA ${r.status}` });
        continue;
      }
      const j = (await r.json()) as { response?: { data?: EiaRow[] } };
      eiaRows = j.response?.data ?? [];
    } catch (err) {
      errors.push({
        state,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // Upsert observations. EIA price is in cents/kWh -> convert to USD/kWh.
    const upsertRows = eiaRows
      .filter((r) => typeof r.price === "number" && r.period)
      .map((r) => ({
        sector: "RES",
        state,
        utility_id: null,
        period: r.period,
        rate_kwh_usd: Number((r.price! / 100).toFixed(4)),
        source: "eia.v2",
      }));

    if (upsertRows.length === 0) continue;

    const upRes = await fetch(
      `${supabaseUrl}/rest/v1/utility_rate_observation?on_conflict=sector,state,utility_id,period`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(upsertRows),
      },
    );
    if (upRes.ok) {
      totalUpserted += upsertRows.length;
    } else {
      const txt = await upRes.text();
      errors.push({ state, error: `upsert ${upRes.status}: ${txt.slice(0, 200)}` });
    }
  }

  return Response.json(
    {
      ok: true,
      states,
      upserted: totalUpserted,
      errors,
    },
    { headers: CORS_HEADERS },
  );
});
